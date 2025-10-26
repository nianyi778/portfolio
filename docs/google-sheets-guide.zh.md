---
title: Google Sheets 资产管理系统：方法说明 & 函数分享
description: 在 Google Sheets 中搭建资产管理系统的结构、函数与使用技巧说明
layout: default
---

📗 Google Sheets 资产管理系统：方法说明 & 函数分享

⸻

## 🧭 初衷与价值

作为个人投资者，我从 2020 年开始构建了一套基于 Google Sheets 的半自动化资产管理系统，目的在于：

- 清晰掌握所有持仓结构、币种分布、市值比例
- 明确配置目标，与当前持仓自动比对
- 实现可视化、结构化、公式驱动的数据分析
- 在无复杂工具的前提下，实现“机构级”的持仓自我管理

这套系统经历了 5 年实盘测试，结构稳定、长期可用，适合个人投资者作为基础模型使用。

⸻

## 🔗 模板链接（公开只读）

📎 Google Sheets 模板地址  
👉 https://docs.google.com/spreadsheets/d/1UPcx6tNZ9wwjNShGZVBwjoMuqfegmCq8vT5cSiQsyBU/edit

你可以选择：

- 复制（Make a copy）到你自己的 Google Drive 中编辑使用
- 或将其作为结构参考，用于构建网页端或其他系统

⸻

## 📊 Sheet 结构一览（3 张核心表）

### 1. 🧾 配置表：PortfolioConfig（用于定义“你的理想结构”）

字段 | 说明
--- | ---
Ticker | 股票/ETF/现金代号（如 AAPL, HKG:0700）
Type | Core / Satellite 分类
Target % | 目标仓位占比
Currency | 资产币种（USD, JPY, HKD 等）
Theme | 自定义板块标签（如 AI、中国、能源）
Buy Price | 你的建仓成本价
Shares | 当前持有数量

👉 所有字段均为手动填写，是策略层的输入。

⸻

### 2. 💹 市场数据表：MarketData（用于动态获取当前价格和汇率）

核心自动化函数示例：

提取唯一 ticker 列表（用于抓价）：

```
=SORT(UNIQUE(Positions!C2:C))
```

将 ticker 映射为币种（便于汇率换算）：

```
=MAP(A2:A, LAMBDA(t, IF(t="",, XLOOKUP(t, Positions!C2:C, Positions!G2:G))))
```

👉 如果你不使用 Google Finance，可手动维护 Price 和 FX 列，结构仍可用。

⸻

### 3. 📈 分析结果表：Portfolio（全自动输出）

核心公式结构如下，一键生成分析结果：

```
=LET(
  header, {
    "Broker","Holding","Ticker","Theme","Position Type","Target %","Currency","Shares",
    "Buy Price","Last Price","FX","Market Value","Weight %","Deviation (W–T)","Return vs Buy"
  },
  data,
  ARRAYFORMULA(
    LET(
      valid, Positions!C2:C<>"",
      broker,  FILTER(Positions!A2:A, valid),
      holding, FILTER(Positions!B2:B, valid),
      tick,    FILTER(Positions!C2:C, valid),
      ind,     FILTER(Positions!D2:D, valid),
      ptype,   FILTER(Positions!E2:E, valid),
      targ,    VALUE(FILTER(Positions!F2:F, valid)),
      curr,    FILTER(Positions!G2:G, valid),
      sh,      VALUE(FILTER(Positions!H2:H, valid)),
      buy,     VALUE(FILTER(Positions!I2:I, valid)),

      price,   IFNA(XLOOKUP(tick, MarketData!A:A, MarketData!E:E), ),
      fx,      IFNA(XLOOKUP(tick, MarketData!A:A, MarketData!F:F), IF(curr="JPY",1, )),
      mval,    sh * IFNA(price,0) * IFNA(fx, IF(curr="JPY",1,0)),
      total,   SUM(mval),

      weight,  IFERROR(mval/total, ),
      ret,     IFERROR(price/buy - 1, ),
      dev,     IFERROR(weight - targ, ),

      SORT(
        {
          broker, holding, tick, ind,
          ptype, targ, curr, sh, buy,
          price, fx, mval, weight, dev, ret
        },
         4, TRUE,  13, FALSE
      )
    )
  ),
  VSTACK(header, data)
)
```

📌 输出字段包括：

- 当前持仓市值、目标权重 vs 实际占比、偏差、盈亏、汇率影响等
- 自动汇总总资产、偏差结构等

⸻

## 💡 使用技巧与建议

场景 | 建议操作
--- | ---
只用现金/ETF/股票 | 支持全部类型混合管理，只需填 ticker 与币种
多币种持仓 | 建议设定好每日汇率，使用 MarketData 表辅助换算
自动 vs 手动 | 可选择全手动填数，或将数据接入 API 后自动更新
图表展示 | 可添加饼图、柱状图等提升视觉结构感
合并多个账户 | 建议在配置表中增加账户名列，如 Broker 字段

⸻

## 📚 总结

这份 Google Sheet 模板是我投资管理系统的雏形。它支持“长期持有 + 结构管理”的策略，适合个人投资者从零构建自己的资产配置体系。

未来，它也将作为我开发的 Web App 的逻辑基础，被完全产品化并开源，帮助更多人像机构一样管理自己的资金。

⸻

如果你希望，我可以继续帮你将该文档输出为：

- README.md 格式（适合 GitHub）
- Notion 结构模板
- 教学博客文章
- PDF 教程文档

告诉我你打算把它发布到哪里，我可以继续为你做适配整理。

