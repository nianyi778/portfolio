---
title: 数据规范（Data Spec）
description: Web App 的数据输入/输出规范、字段定义与计算口径；供开发/对接参考
layout: default
version: 1.0.0
---

## 1. 读者与范围
- 面向对象：开发/集成方（CSV/JSON 接口）、数据维护者
- 覆盖范围：模板导入、字段定义、计算口径、价格/汇率与 override 规则、输出产物

## 2. 文件与接口
- 输入（三选一或组合）：
  - `holdings.csv`（持仓明细）
  - `market_data.csv`（价格/汇率/override）
  - `config.json`（统一配置；可完全替代 CSV）
- 自动数据：
  - `data/prices.json`（由 Actions/脚本周期生成：prices + fx）
- 输出/状态：
  - 浏览器内存/LocalStorage；可导出快照 JSON

## 3. 字段定义

### 3.1 holdings.csv（持仓）
必填字段：
- `ticker`：带交易所前缀，如 `NASDAQ:NVDA`、`HKG:0700`、`TYO:4051`、`Cash_USD`
- `currency`：`JPY|USD|HKD|CNY|...`
- `quantity`：≥0（现金可用金额表示，配合 price=1）
可选字段：
- `account`：账户标识
- `cost_per_unit`：买入成本（标的币种）
- `targetweight`：目标占比（百分数，例如 15 表示 15%）
- `category`：`Core|Satellite|Other|...`
- `override_ticker`：覆盖引用（见 4.2）

示例：
```
account,ticker,currency,quantity,cost_per_unit,targetweight,category
sbi,TYO:4051,JPY,100,6200,5,Core
ibkr,NASDAQ:NVDA,USD,12,150,15,Core
cash,Cash_JPY,JPY,1000000,,10,Cash
```

### 3.2 market_data.csv（价格/汇率/覆盖）
- `ticker`：与 holdings 对齐
- `currency`：标的币种
- `current_price`：标的币种价格
- `fx_to_jpy`：“每 1 单位标的币种可换日元”数值（例如 USD→JPY=150.4）
- `override_ticker`：可选。若填，则本行 JPY 换算优先引用该 ticker 的 JPY 价格

示例：
```
ticker,currency,current_price,fx_to_jpy,override_ticker
NASDAQ:NVDA,USD,183.22,150.4,
HKG:0700,HKD,608,19.4,TYO:2845
TYO:2845,JPY,3027,1,
Cash_USD,USD,1,150.4,
```

### 3.3 config.json（统一配置）
```
{
  "baseCurrency": "JPY",
  "fxRates": { "USD": 150.4, "HKD": 19.4, "CNY": 21.1, "JPY": 1 },
  "assets": [
    { "ticker": "NASDAQ:NVDA", "currency": "USD", "quantity": 12, "price": 183.22, "targetWeight": 0.15, "category": "EquityUS", "role": "Core", "overrideTicker": null },
    { "ticker": "HKG:0700", "currency": "HKD", "quantity": 200, "price": 608, "targetWeight": 0.10, "category": "EquityHK", "role": "Satellite", "overrideTicker": "TYO:2845" }
  ]
}
```

约束：
- `targetWeight` 为 0–1 的小数；前端会显示为百分比
- `price` 可为 null（由 `prices.json` 或 `market_data.csv` 覆盖）
- `fxRates` 为“FX→JPY”，即每 1 单位该币种折算多少 JPY

### 3.4 data/prices.json（自动产出）
```
{
  "prices": [ { "ticker": "NASDAQ:NVDA", "currency": "USD", "price": 183.22, "fetchedAt": "ISO" } ],
  "fx": { "USD": 150.4, "HKD": 19.4, "JPY": 1 }
}
```

## 4. 计算口径与规则

### 4.1 价格选择与汇率
- 优先级：`prices.json` → `market_data.csv`/`config.json` → 手工输入
- 汇率口径：统一采用“FX→JPY”（每 1 单位外币折算多少 JPY）

### 4.2 override 语义
- 若某行存在 `override_ticker`：优先使用其对应的 JPY 价格作为本行 JPY 价格
- 否则：`priceJPY = current_price × fx_to_jpy`（或 `price × fxRates[currency]`）
- 现金类：`Cash_USD` 价格固定为 1，按汇率折算

### 4.3 统一到 JPY 的指标
- `priceJPY(ticker)`：按 4.2 求得
- `valueJPY`：`priceJPY × quantity`
- `actualWeight`：`valueJPY / Σ(valueJPY)`
- `deviation`：`actualWeight - targetWeight(%)`
- `status`：阈值判定 `Overweight / Underweight / Neutral`

## 5. 与 Google Sheets 的字段映射（概览）
- PortfolioConfig.Ticker ↔ `ticker`
- PortfolioConfig.Target % ↔ `targetweight`（CSV 百分数；config 为 0–1）
- PortfolioConfig.Currency ↔ `currency`
- PortfolioConfig.Shares ↔ `quantity`
- MarketData.Price ↔ `current_price | price`
- MarketData.FX ↔ `fx_to_jpy | fxRates[currency]`

## 6. 版本与变更
- v1.0.0：首次发布，与 PRD v3/模板 `templates/*` 对齐

