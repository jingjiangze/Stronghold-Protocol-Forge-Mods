# PROVENANCE — 手动合成与拖拽堆叠（前向兼容参考）

本文件由提交人参照 `tools/build-index.mjs` 格式手工填写。**没有的事实写「未声明」，不编造。**

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `manual-item-merge` · 0.1.0 |
| ② 原作者 | 未署名（来源：用户提供的 `原版增强安装.zip`） |
| ③ 原件许可 | CC0-1.0（取自 plugin.json） |
| ④ 兼容改写者 | 未声明 |
| ⑤ 来源 | 用户提供的 `原版增强安装.zip`（2026-10-20 提交） |
| ⑥ 改了什么 | 从包内 `files/` 分支提取手动合成/拖拽堆叠相关实现片段，整理为 manifest 2 插件形态（参考包） |

## 素材与授权

- 无素材，纯源码参考包。许可 CC0-1.0。

## 其他须知

- ⚠️ **当前为参考包（documentation 类）**：「卸下装备」已由引擎 `rules.unequip` 支持（vanilla-plus 插件已用）；但「不自动合成 + 拖拽堆叠」所需引擎侧 `manualItemMerge` getter、`g.itemStack` 协议键、`stackItem()` 处理器、客户端拖拽合成 UI 挂点均缺失，装上**不会生效**。详见包内 `README.md`。
- 引擎补面后即可改 `category` 为 `functional` 并启用。源码片段在 `src/`。
