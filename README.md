# luci-app-run

`luci-app-run` 是一个轻量级的 OpenWrt LuCI 应用，用于上传并运行脚本和安装包。

<img width="1920" height="500" alt="121" src="https://github.com/user-attachments/assets/ba7653ef-7414-45d3-973b-31e2c1ab6396" />

它支持用户上传 `.run`、`.sh`、`.ipk` 和 `.apk` 文件，将其保存到 `/tmp/luci-app-run` 目录，并根据文件类型执行相应的操作：
- `.run` 和 `.sh` 文件：赋予可执行权限后直接运行
- `.ipk` 文件：使用 opkg 包管理器安装（适用于 OpenWrt 24.10 及以下版本）
- `.apk` 文件：使用 apk 包管理器安装（适用于 OpenWrt 25.12 及以上版本）

执行日志会实时返回到 LuCI 页面。

对于较大文件的上传，采用独立的 CGI 接口 `/cgi-bin/luci-app-run-upload` 进行一次性令牌验证的二进制上传，避免使用 base64-over-ubus 分块传输，从而获得接近原生 HTTP 的上传速度。

## 使用 OpenWrt SDK 编译

将本目录复制或软链接到 OpenWrt SDK 的 package feed 中，例如：

```sh
mkdir -p package/luci-app-run
cp -a /path/to/luci-app-run/* package/luci-app-run/
./scripts/feeds update -a
./scripts/feeds install -a
make package/luci-app-run/compile V=s
```

## 安装方法
### Luci 25.12.x

#### 先解锁 25.12.x OpenWrt 的安装功能（开关），然后在系统——软件包 上传安装apk
```sh
wget -O toggle.sh https://cafe.cpolar.cn/wkdaily/cool/raw/branch/master/apk-untrusted-toggle.sh && sh toggle.sh

```

### Luci 21——24.10 
- 在系统——软件包 上传安装ipk


### 程序截图
<img width="3804" height="1592" alt="image" src="https://github.com/user-attachments/assets/b3ec81f1-1bfa-4db3-bc74-43965f238cfb" />


## ❤️赞助作者 ⬇️⬇️

<a href="https://wkdaily.cpolar.cn/01" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
       alt="Buy Me A Coffee"
       style="width:15%; height:auto;">
</a>

