# 干员自由拖放与朝向轮盘（服务端兼容移植） — SOURCE

## 1. 原件叫什么、从哪来
- **名称**：干员自由拖放与朝向轮盘（服务端兼容移植）
- **来源**：本地包 `干员自由拖放与朝向轮盘-服务器兼容代码-20261015.zip`
- **版本或日期**：1.0.0
- **拿到的方式**：本地离线 zip

## 2. 原作者
- **署名**：原件未署名（移植自 sp.isomer319.xyz 现网实现）
- **联系方式**：无

## 3. 原件的许可
- **有没有 LICENSE**：GPL-3.0-or-later
- **是否允许再分发**：不清楚
- **其它限制**：见上方许可一栏

## 4. 它改了什么
- **适配说明**：原件是「源码片段集」——`portable/`（可独立运行的兼容模块）+ `integration-fragments/`（接入片段），没有 pack.json。
- 本次补写 pack.json（id=drag-facing-wheel, game=0.3.x），只收 `portable/` 与 `integration-fragments/`，**不收** `.ps1/.bat` 安装器与 demo/tests。
- `integration-fragments/` 依赖原闭包变量，不能当独立 ES 模块直接跑；它们是对接参考，实际接入要按 agent.md 手工合入。

- **有没有改引擎源码**：见上
- **有没有加新的干员 / 盟约 / 装备 / 特质**：见上
- **它自己说它做了什么**：见包内 README / manifest

## 5. 自带素材是哪来的
- 素材文件：0 个 / 0 B（{}）
- 来源与授权：GPL-3.0-or-later

## 6. 安装
- 工坊包形态：zip 根（或唯一顶层目录）有 `pack.json`，id = `drag-facing-wheel`，version = `1.0.0`。
