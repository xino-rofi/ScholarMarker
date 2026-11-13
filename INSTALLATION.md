# 安装 / Installation

适用 / Supported: Windows + Zotero 10.0.8。先备份并建议在测试profile试用 / Back up first; trying a separate test profile is recommended.

1. 从维护者批准的GitHub Release下载scholarmarker-0.9.4beta1.xpi；源码ZIP不是安装包。Download the XPI, not a source archive.
2. Zotero“工具 → 插件 / Tools → Plugins”，将XPI拖到插件窗口，按宿主提示安装。Drag the XPI into the Plugins window and follow Zotero prompts.
3. 打开可编辑的用户库PDF，点击Reader中的ScholarMarker设置，阅读并选择“启用本机 Ping 功能”或“暂不启用”。Open a PDF and explicitly enable local Ping features, or decline.
4. 在Ping面板导入素材并配置快捷键；阅读区需聚焦、鼠标在PDF上。Import materials, configure a shortcut, focus and hover over the PDF.

无需CMD、Node、手动grant或迁移脚本。Node is only required for source builds.

sidecar在当前profile的scholarmarker目录，普通显示/声音偏好在当前profile。Zotero Sync不保证同步sidecar；不要跨实例复制owner。撤销会拒绝新的业务准入，不删除已有数据或回滚未知事务。Uncertain states stop writes; do not remove locks or retry deletion.

升级使用相同插件ID；公开Beta不自动迁移旧开发布局，不承诺降级恢复。自动更新关闭，后续版本需手动下载。禁用、卸载保留插件数据，重新安装可读取兼容的已知数据；遇到未知或损坏目录应停止并反馈，不以空库覆盖。

安装方式依据 https://www.zotero.org/support/plugins 。首次公开仍需维护者批准。
