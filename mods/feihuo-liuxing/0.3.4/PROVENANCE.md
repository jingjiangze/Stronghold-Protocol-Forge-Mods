# PROVENANCE — 飞火流星

本文件由提交人参照 `tools/build-index.mjs` 格式手工填写。**没有的事实写「未声明」，不编造。**

| 项 | 值 |
|---|---|
| ① 包 id / 版本 | `feihuo-liuxing` · 0.3.4 |
| ② 原作者 | 未署名（来源：用户提供的 `原版增强安装.zip`） |
| ③ 原件许可 | CC0-1.0（取自 plugin.json） |
| ④ 兼容改写者 | 未声明 |
| ⑤ 来源 | 用户提供的 `原版增强安装.zip`（2026-10-20 提交） |
| ⑥ 改了什么 | 原样提交包内 `feihuo/plugins/feihuo-liuxing/` 目录（manifest 2 合规插件，含 plugin.lock.json、spine 前后视、operators） |

## 素材与授权

- 含 Spine 骨骼 / 图集 / 立绘 / 头像等原创干员「飞火流星」美术资源，版权归制作者所有，许可 CC0-1.0。
- 非官方游戏素材。

## 其他须知

- ⚠️ **当前限制**：本插件的干员技能脚本 `server/sim/content/kits/ops/chess_x_feihuo-liuxing.js` 走的是**引擎 kits 注册表**（硬编码 `kits/index.js`，非插件 part）。mod 管理器引擎目前**没有 `kits` part 与动态 kit 发现机制**，因此该 kit 文件不会被自动加载。装上本插件可获得数据 / 美术 / Spine / 干员记录，但**技能行为暂不会生效**，需引擎补 `kits` part 后才完整。
- `app: ">=0.3.0 <0.4.0"`，需 mod 管理器 0.3.x 底座。
