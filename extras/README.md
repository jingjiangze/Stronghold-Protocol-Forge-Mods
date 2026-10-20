# extras/ —— 不兼容 / 参考件

这里放**不能当 mod 装上、但有参考价值**的源码件。

## 为什么单独一个目录

- `mods/` 是成品区：`mod-gate` 的 J1 判据要求 `mods/**/mod.zip` 的根必须有
  `pack.json` 或 `plugin.json`，没有就被判 FAIL、PR 合不了。
- 这里的件**不是工坊包**（没有 pack.json），所以放 `mods/` 会卡死。
- `extras/` 完全不经闸门 —— `mod-gate` 只看 `^(mods|incoming)/.*\.zip$`。

## 结构

每个条目一个子目录：

```
extras/<id>/manifest.json   ← 展示元数据（含 compatibility.verdict）
extras/<id>/<xxx>.zip       ← 源码包
```

## 站点怎么展示

生成器把每个 `manifest.json` 汇总成 `modsite/extras.json`，首页渲染成
「不兼容 / 参考件」分组，**与正常 mod 列表分开**——避免让人误以为能装。

## manifest 必填字段

`id` `name` `version` `kind:"reference"` `note` `compatibility.verdict`
`author` `license` `download` `zip.{name,bytes,sha256}`
