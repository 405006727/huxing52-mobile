# 52户型装修设计 · 手机版（Android）

「52户型装修设计」的移动端，与电脑版**共用同一套设计内核**（同一份 `designer.html` + 同一套 dxf / 图片识墙 / 交付包模块），只在交互外壳上做移动适配，并套一个原生 Android 壳变成可安装的 App。

- 电脑版仓库：[405006727/huxing52-designer](https://github.com/405006727/huxing52-designer)
- 手机版仓库：本仓库 `huxing52-mobile`

两个仓库分开维护：电脑端改动进电脑仓库，手机端（移动适配层、Android 壳、打包）改动进本仓库。

## 安装

| 方式 | 说明 |
|---|---|
| **Android APK**（推荐） | `52户型装修设计-手机版-1.0.0.apk`，直接安装。签名 30 年有效，包名 `com.huxing52.designer`，minSdk 24（Android 7.0 起），targetSdk 34 |
| 网页版（备用） | 仓库不存 2.6 MB 的单文件产物，可用构建脚本一键生成；也能局域网扫码用手机浏览器打开 |

APK 首次安装需要在系统设置里允许「安装未知来源应用」。

## 功能

与电脑版逐项对齐（左栏 ☰ / 右上 ⓘ / 底部图层条）：

- 画墙、门窗、家具、房间、墙体拆改（半圆墙 / 挑高 / 拆地板），撤销重做
- 自动布水电（点位 + 回路），点位可单点改
- 2D / 3D 鸟瞰 / 3D 漫游，整栋多层；进 3D 自动取景，↺ 可重置视角
- 多楼层增删与标高、整栋成型
- 报价（材料 / 人工 / 单价）
- 从 CAD 图纸新建（DXF 识墙，可按图层筛墙）
- 从户型图片新建（自动识墙）
- 存 / 开方案文件（.json）
- 导出图纸：A3 PDF、CAD（国标 / 装修 / 水电）、原始结构图、拆改图、铺装图、顶面图、3D 画面、彩平图
- 交付包：看板底图（日 / 夜）、带点位编号的交付图、设备清单、设备档案、配电箱回路表、Home Assistant 坐标与卡片配置
- 深浅色跟随系统

与电脑版的差异只有两处：不读取电脑上的 `设备档案.json`（交付包按默认功率估算）；导出统一落到手机「下载」目录。

## 手机上怎么用

| 操作 | 入口 |
|---|---|
| 画墙 | 底部工具条「墙」→ 点起点、点终点 |
| 缩放 / 平移 | 两指捏合、两指拖动（2D、3D 都支持） |
| 左栏 / 右栏 | 左上 ☰ / 右上 ⓘ，抽屉式，点遮罩收起 |
| 2D / 分屏 / 3D | 顶栏三个方块 |
| 图层 | 底部左侧胶囊（布置 / 水电 / 顶面 / 铺装 / 拆改） |
| 存文件 / 开文件 / 导出图纸 | 工具条下方 |
| CAD / 图片识墙 / 交付包 | 右上 ⋯ 菜单 |

所有可点区域 ≥ 40px；工具条可横向滑动。

## 数据

- 方案存在 WebView 本地存储（`appassets.androidplatform.net` 源），关掉 App 不丢，**卸载会清空**；
- 完成的方案请用「存文件」导出 .json 留档，换机 / 重装后用「开文件」导入；
- App 内所有下载（.json / .dxf / .svg / .png / 交付包 .zip）都通过原生接口写进系统「下载」目录。

## 构建

需要 JDK 17、Android SDK（platform 34 + build-tools 34）、Gradle 8.7。构建目录请放 ASCII 路径（中文路径容易让 aapt2 失败）。

```bash
# 1. 生成单文件网页（依赖电脑版仓库的 app/ 目录）
node tools/build-mobile.mjs <输出目录>

# 2. 放进 assets
copy <输出目录>\index.html app\src\main\assets\index.html

# 3. 打包
set JAVA_HOME=<jdk17>
set ANDROID_HOME=<android-sdk>
gradle assembleRelease
```

产物：`app/build/outputs/apk/release/52huxing-designer-android-release.apk`。

签名用的是本机保存的自签名证书（别名 `huxing52`，30 年有效期），**故意不入库**，避免别人拿它签伪造更新。换证书会变成另一个 App，无法覆盖安装。

## 目录

```
source/mobile/adapt.css          移动适配样式（注入式，不改内核）
source/mobile/adapt.js           移动适配运行时（抽屉/菜单/导入/交付包/原生保存）
source/tools/build-mobile.mjs    单文件构建脚本
android/MainActivity.java        原生壳：WebView + 文件选择 + 原生保存
android/build.gradle             应用模块（AGP 8.5.2）
android/settings.gradle
android/gradle.properties
android/AndroidManifest.xml
android/res/values/*.xml
使用说明.md                       给使用者的完整说明（安装/手势/功能对照/限制）
CHANGELOG.md                     更新说明
```

## 更新策略

- **默认随电脑版**：电脑版发版时，手机版同步重建内核，版本号跟内核版本对齐（如内核 1.4.0 → 手机版 1.4.x 构建）；
- **手机端单独更新**：只在移动适配层 / Android 壳有改动时才发，每次都在 `CHANGELOG.md` 写明改了什么、为什么，以及是否带入新的电脑版内核；
- 手机版不脱离电脑版内核独立演进，避免两套功能说法不一致。

## 免责

水电点位、线径、断路器规格都是按常见做法给出的**估算与建议值**，交付包里的统计同理；结构拆改、水电安全结论必须由持证专业人员按现场复核。图片识墙对拍照角度与光照敏感，识别后请核对尺寸链。
