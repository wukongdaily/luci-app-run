'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var I18N = null;

function loadI18N() {
	if (I18N)
		return Promise.resolve();

	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', '/luci-static/resources/view/run/i18n.json', true);
		xhr.onload = function() {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					I18N = JSON.parse(xhr.responseText);
					resolve();
				} catch (e) {
					reject(e);
				}
			} else {
				reject(new Error('Failed to load i18n.json'));
			}
		};
		xhr.onerror = function() {
			reject(new Error('Network error loading i18n.json'));
		};
		xhr.send();
	});
}

function getLang() {
	try {
		var m = document.cookie.match(/luci_lang=([a-zA-Z-]+)/);
		if (m) return m[1].substring(0, 2).toLowerCase();

		if (window.L && L.env && L.env.lang)
			return L.env.lang.substring(0, 2).toLowerCase();

		return 'zh';
	} catch (e) {
		return 'zh';
	}
}

function _(key) {
	if (!I18N)
		return key;

	var lang = getLang();
	var str = I18N[lang]?.[key] || I18N.zh[key] || key;
	var args = Array.prototype.slice.call(arguments, 1);
	return str.format.apply(str, args);
}

var uploadStart = rpc.declare({
	object: 'luci-app-run',
	method: 'upload_start',
	params: ['filename', 'size']
});

var uploadChunk = rpc.declare({
	object: 'luci-app-run',
	method: 'upload_chunk',
	params: ['id', 'data', 'index']
});

var uploadFinish = rpc.declare({
	object: 'luci-app-run',
	method: 'upload_finish',
	params: ['id']
});

var runInstaller = rpc.declare({
	object: 'luci-app-run',
	method: 'run',
	params: ['id']
});

var getStatus = rpc.declare({
	object: 'luci-app-run',
	method: 'status'
});

var getVersion = rpc.declare({
	object: 'luci-app-run',
	method: 'version'
});

var getCapabilities = rpc.declare({
	object: 'luci-app-run',
	method: 'capabilities'
});

var readLog = rpc.declare({
	object: 'luci-app-run',
	method: 'read_log',
	params: ['offset']
});

var cleanup = rpc.declare({
	object: 'luci-app-run',
	method: 'cleanup'
});

function formatBytes(size) {
	if (size >= 1024 * 1024)
		return '%.1f MiB'.format(size / 1024 / 1024);

	if (size >= 1024)
		return '%.1f KiB'.format(size / 1024);

	return '%d B'.format(size);
}

function bufferToBase64(buffer) {
	var bytes = new Uint8Array(buffer);
	var parts = [];
	var chunk = 0x8000;

	for (var i = 0; i < bytes.length; i += chunk)
		parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));

	return btoa(parts.join(''));
}

return view.extend({
	handleSave: null,
	handleReset: null,
	handleSaveApply: null,

	logOffset: 0,
	currentUploadId: null,
	appVersion: 'unknown',
	capabilities: { opkg: 1, apk: 1 },

	load: function () {
		var self = this;
		return loadI18N().then(function () {
			return getVersion().then(function (res) {
				if (res && res.version) {
					self.appVersion = res.version;
					var storedVersion = localStorage.getItem('luci-app-run-version');
					if (storedVersion && storedVersion !== self.appVersion) {
						localStorage.setItem('luci-app-run-version', self.appVersion);
						window.location.reload(true);
					} else {
						localStorage.setItem('luci-app-run-version', self.appVersion);
					}
				}
				return getCapabilities().then(function (cap) {
					if (cap) {
						self.capabilities = {
							opkg: cap.opkg || 0,
							apk: cap.apk || 0
						};
					}
					return getStatus().catch(function () {
						return {};
					});
				}).catch(function () {
					return getStatus().catch(function () {
						return {};
					});
				});
			}).catch(function () {
				return getCapabilities().then(function (cap) {
					if (cap) {
						self.capabilities = {
							opkg: cap.opkg || 0,
							apk: cap.apk || 0
						};
					}
					return getStatus().catch(function () {
						return {};
					});
				}).catch(function () {
					return getStatus().catch(function () {
						return {};
					});
				});
			});
		}).catch(function () {
			return getStatus().catch(function () {
				return {};
			});
		});
	},

	render: function (status) {
		var self = this;

		var fileInput = E('input', {
			'type': 'file',
			accept: '.run,.sh,.ipk,.apk,application/x-shellscript,application/octet-stream',
			style: 'display:none'
		});

		var ipkInput = E('input', {
			'type': 'file',
			accept: '.ipk',
			style: 'display:none'
		});

		var apkInput = E('input', {
			'type': 'file',
			accept: '.apk',
			style: 'display:none'
		});

		var progress = E('progress', {
			max: 100,
			value: 0,
			style: 'width:100%;display:none'
		});

		var state = E('div', { 'class': 'cbi-value-description' }, _('drop_tip'));

		var log = E('pre', {
			id: 'run-log',
			style: 'min-height:16em;max-height:32em;overflow:auto;background:#111;color:#eee;padding:1em;white-space:pre-wrap',
		}, ['']);

		var pickButton = E('button', {
			class: 'btn cbi-button cbi-button-apply',
			style: 'background-color:#333;color:white;border-color:#333',
			click: function (ev) {
				ev.preventDefault();
				fileInput.click();
			}
		}, [_('choose_file')]);

		var ipkButton = E('button', {
			class: 'btn cbi-button cbi-button-add',
			style: 'margin-left:10px;background-color:#2E7D32;color:white',
			click: function (ev) {
				ev.preventDefault();
				ipkInput.click();
			}
		}, [_('choose_ipk')]);

		var apkButton = E('button', {
			class: 'btn cbi-button cbi-button-add',
			style: 'margin-left:10px;background-color:#1565C0;color:white',
			click: function (ev) {
				ev.preventDefault();
				apkInput.click();
			}
		}, [_('choose_apk')]);

		var runButton = E('button', {
			class: 'btn cbi-button cbi-button-action',
			disabled: true,
			style: 'min-width:140px;margin-left:15px;',
			click: function (ev) {
				ev.preventDefault();
				self.startRun(runButton, state);
			}
		}, [_('execute')]);

		var cleanButton = E('button', {
			class: 'btn cbi-button cbi-button-reset',
			style: 'margin-left:35px;',
			click: function (ev) {
				ev.preventDefault();
				cleanup().then(function (res) {
					if (res && res.error)
						throw new Error(res.error);

					self.currentUploadId = null;
					self.logOffset = 0;
					runButton.disabled = true;
					log.textContent = '';
					progress.style.display = 'none';
					state.textContent = _('clean_done');
				}).catch(function (err) {
					ui.addNotification(null, E('p', [err.message || err]), 'danger');
				});
			}
		}, [_('clean_up')]);

		var drop = E('div', {
			class: 'cbi-section',
			style: 'border:2px dashed var(--border-color-high,#999);padding:2em;text-align:center',
			dragover: function (ev) {
				ev.preventDefault();
				drop.style.borderStyle = 'solid';
			},
			dragleave: function () {
				drop.style.borderStyle = 'dashed';
			},
			drop: function (ev) {
				ev.preventDefault();
				drop.style.borderStyle = 'dashed';
				if (ev.dataTransfer.files && ev.dataTransfer.files.length)
					self.uploadFile(ev.dataTransfer.files[0], progress, state, runButton);
			}
		}, [
			E('h3', [_('upload_title')]),
			E('p', [state]),
			E('p', [pickButton, ipkButton, apkButton]),
			E('p', { style: 'margin-top:10px' }, [runButton, cleanButton]),
			progress,
			fileInput,
			ipkInput,
			apkInput
		]);

		fileInput.addEventListener('change', function () {
			if (fileInput.files && fileInput.files.length)
				self.uploadFile(fileInput.files[0], progress, state, runButton);
		});

		ipkInput.addEventListener('change', function () {
			if (ipkInput.files && ipkInput.files.length)
				self.uploadFile(ipkInput.files[0], progress, state, runButton);
		});

		apkInput.addEventListener('change', function () {
			if (apkInput.files && apkInput.files.length)
				self.uploadFile(apkInput.files[0], progress, state, runButton);
		});

		poll.add(function () {
			return self.refreshLog(log, state);
		}, 1);

		this.applyStatus(status, state);

		return E('div', { class: 'cbi-map' }, [
			E('h2', [_('title')]),
			E('div', { class: 'cbi-map-descr', style: 'margin-bottom:15px' }, [_('desc')]),
			drop,
			E('div', { class: 'cbi-section' }, [
				E('h3', [_('log_title')]),
				log
			])
		]);
	},

	applyStatus: function (status, state) {
		if (!status) return;

		if (status.running)
			state.textContent = _('running');
		else if (status.file)
			state.textContent = _('last_file', status.file);
	},

	uploadFile: function (file, progress, state, runButton) {
		var self = this;

		if (!file.name.match(/\.(run|sh|ipk|apk)$/i)) {
			ui.addNotification(null, E('p', [_('only_supported')]), 'danger');
			return Promise.reject();
		}

		progress.style.display = '';
		progress.value = 0;
		runButton.disabled = true;
		state.textContent = _('prepare_upload', file.name, formatBytes(file.size));

		return uploadStart(file.name, file.size).then(function (res) {
			if (res && res.error)
				throw new Error(res.error);

			self.currentUploadId = res.id;
			return self.uploadFileFast(res, file, progress, state, runButton);
		}).catch(function (err) {
			progress.style.display = 'none';
			state.textContent = _('upload_failed');
			ui.addNotification(null, E('p', [err.message || err]), 'danger');
		});
	},

	uploadFileFast: function (session, file, progress, state, runButton) {
		var self = this;
		var url = '/cgi-bin/luci-app-run-upload?id=' +
			encodeURIComponent(session.id) + '&token=' + encodeURIComponent(session.token);

		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.open('POST', url, true);
			xhr.setRequestHeader('Content-Type', 'application/octet-stream');

			xhr.upload.onprogress = function (ev) {
				if (!ev.lengthComputable) return;
				progress.value = Math.floor(ev.loaded * 100 / ev.total);
				state.textContent = _('uploading', file.name, progress.value);
			};

			xhr.onerror = function () {
				document.querySelector('.cbi-button-action').disabled = false;
				reject(new Error(_('upload_err')));
			};

			xhr.onload = function () {
				document.querySelector('.cbi-button-action').disabled = false;
				progress.value = 100;

				uploadFinish(session.id).then(function () {
					state.textContent = _('upload_done', file.name, formatBytes(file.size));
				}).catch(function () {
					state.textContent = _('upload_done', file.name, formatBytes(file.size));
				});

				resolve();
			};

			xhr.send(file);
		});
	},

	startRun: function (runButton, state) {
		var self = this;

		if (!this.currentUploadId) return;

		runButton.disabled = true;
		state.textContent = _('starting');

		return runInstaller(this.currentUploadId).then(function (res) {
			if (res && res.error) {
				var errorMsg = res.error;
				if (res.error === 'ERR_NO_OPKG') {
					errorMsg = _('err_no_opkg');
				} else if (res.error === 'ERR_NO_APK') {
					errorMsg = _('err_no_apk');
				}
				throw new Error(errorMsg);
			}

			self.logOffset = 0;
			state.textContent = _('started', res.pid);
		}).catch(function (err) {
			runButton.disabled = false;
			ui.addNotification(null, E('p', [err.message || err]), 'danger');
		});
	},

	refreshLog: function (log, state) {
		var self = this;

		return readLog(this.logOffset).then(function (res) {
			if (!res || res.error) return;

			if (res.data) {
				log.textContent += res.data;
				log.scrollTop = log.scrollHeight;
			}

			self.logOffset = res.offset || self.logOffset;

			if (res.running)
				state.textContent = _('running');
		}).catch(function () { });
	}
});