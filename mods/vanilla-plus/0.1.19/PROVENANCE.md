# PROVENANCE — 原版增强

本文件由提交人参照 `tools/build-index.mjs` 格式手工填写。**没有的事实写「未声明」，不编造。**

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `vanilla-plus` · 0.1.19 |
| ② 原作者 | 未署名（来源：用户提供的 `原版增强安装.zip`） |
| ③ 原件许可 | CC0-1.0（取自 plugin.json） |
| ④ 兼容改写者 | 未声明 |
| ⑤ 来源 | 用户提供的 `原版增强安装.zip`（2026-10-20 提交） |
| ⑥ 改了什么 | 原样提交包内 `files/plugins/vanilla-plus/` 目录（manifest 2 合规插件，含 plugin.lock.json） |

## 素材与授权

- 本包**不含**官方 Spine / 音频素材（zip 内仅 data json、png 图标、lock）。
- 许可：CC0-1.0（作者未署名，仅声明许可）。

## 其他须知

- 本插件声明 `rules:{unequip:"allow"}`：依赖 mod 管理器引擎已有的 `rules.unequip` 开关（两树 `shared/plugins/rules.js:40-43` 一致），装上即获得「休整期卸下装备」能力。
- `app: ">=0.3.0 <0.4.0"`，需 mod 管理器 0.3.x 底座。
