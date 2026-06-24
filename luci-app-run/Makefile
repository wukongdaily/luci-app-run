include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-run
PKG_VERSION:=1.0.0
PKG_RELEASE:=7

LUCI_TITLE:=LuCI support for running installers and packages
LUCI_DESCRIPTION:=Upload and execute .run, .sh, .ipk and .apk files from LuCI.
LUCI_DEPENDS:=+luci-base +rpcd +libubox
LUCI_PKGARCH:=all

PKG_MAINTAINER:=wukongdaily <wukongdaily@gmail.com>

# 定义版本号用于缓存刷新
define Package/luci-app-run/postinst
#!/bin/sh
# 设置版本号到临时文件，用于前端资源缓存刷新
echo "$(PKG_VERSION)-$(PKG_RELEASE)" > /tmp/luci-app-run.version
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature