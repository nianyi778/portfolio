# 功能模块清单 + 字段定义表

本文给出 MVP 阶段的模块划分与数据结构定义，支持“模板导入 → 统一折算为 JPY → 目标 vs 实际占比偏差分析 → 图表展示”。

## 一、功能模块清单（MVP）
- 数据导入
  - 加载模板：`market_data.csv`、`holdings.csv`、或统一的 `config.json`
  - 解析价格、币种、汇率、替代 ticker、目标占比等
- 参数配置
  - 为每个资产设置：目标占比、资产类别（Core/Satellite/自定义）、币种、替代 ticker
  - 支持手动维护汇率或从模板读取
- 实时持仓比对
  - 计算：每项资产当前市值（JPY）、实际占比、与目标占比偏差
  - 标注：超配 / 低配（含阈值设置）
- 图表展示
  - 饼图：资产分布
  - 柱状图：实际 vs 目标占比差异
- 存储与导出
  - 本地浏览器存储（LocalStorage）保存最近一次参数
  - 导出当前视图为 JSON / CSV

## 二、数据结构 / 字段定义

### 1) holdings.csv（持仓明细）
建议列：
- `account`：账户标识（可选）
- `ticker`：带交易所前缀的唯一标识，例如 `NYSE:NVDA`、`HKG:0700`、`TYO:4051`、`Cash_USD`
- `currency`：币种（`JPY`/`USD`/`HKD`/`CNY` 等）
- `quantity`：数量（现金类可用金额表示，配合 price=1）
- `cost_per_unit`：买入成本（标的币种，可选，用于盈亏）

示例：
```
account,ticker,currency,quantity,cost_per_unit
sbi,TYO:4051,JPY,100,6200
ibkr,NASDAQ:NVDA,USD,12,150
cash,Cash_JPY,JPY,1000000,
```

### 2) market_data.csv（市场数据/价格 + 汇率 + 覆盖）
建议列：
- `ticker`：与持仓表一致
- `currency`：标的币种
- `current_price`：标的币种价格
- `fx_to_jpy`：该币种兑 JPY 的汇率（例如 USD→JPY 为 150.4）
- `override_ticker`：可选。如果填写，则以该 ticker 的 JPY 价格作为本行换算基准（适合对标 ETF/替代标的）

换算逻辑：
- 若 `override_ticker` 存在，则优先使用其对应 JPY 价格；否则 `current_price × fx_to_jpy`
- 现金类（如 `Cash_USD`）可设 `current_price=1`，通过汇率折算为 JPY

示例：
```
ticker,currency,current_price,fx_to_jpy,override_ticker
NASDAQ:NVDA,USD,183.22,150.4,
HKG:0700,HKD,608,19.4,TYO:2845
TYO:2845,JPY,3027,1,
Cash_USD,USD,1,150.4,
```

### 3) config.json（统一配置模板，可替代上面两张表）
字段：
- `baseCurrency`: 基准币种（`JPY`）
- `fxRates`: `{ "USD": 150.4, "HKD": 19.4, ... }`（`JPY` 可省略或取 `1`）
- `assets`: 资产清单数组，每项：
  - `ticker`, `name?`, `currency`, `quantity?`, `targetWeight?`, `category?`（如 `EquityJP/EquityUS/ETF/Cash/...`）, `role?`（`Core`/`Satellite`）, `overrideTicker?`
  - `price`: 当前价格（标的币种）或 `null`（若计划走 API 自动获取则在前端获取）

示例：
```json
{
  "baseCurrency": "JPY",
  "fxRates": { "USD": 150.4, "HKD": 19.4, "CNY": 21.1, "JPY": 1 },
  "assets": [
    { "ticker": "NASDAQ:NVDA", "currency": "USD", "quantity": 12, "price": 183.22, "targetWeight": 0.15, "category": "EquityUS", "role": "Core" },
    { "ticker": "HKG:0700", "currency": "HKD", "quantity": 200, "price": 608, "targetWeight": 0.10, "category": "EquityHK", "role": "Satellite", "overrideTicker": "TYO:2845" },
    { "ticker": "TYO:2845", "currency": "JPY", "quantity": 300, "price": 3027, "targetWeight": 0.05, "category": "ETF", "role": "Satellite" },
    { "ticker": "Cash_USD", "currency": "USD", "quantity": 20000, "price": 1, "targetWeight": 0.10, "category": "Cash" }
  ]
}
```

### 4) 计算口径（统一到 JPY）
- `priceJPY(ticker)`：
  - 若存在 `override_ticker` → 使用其 `priceJPY`
  - 否则 `current_price × fx_to_jpy`（或 `price × fxRates[currency]`）
- `valueJPY`：`priceJPY × quantity`
- `actualWeight`：`valueJPY / Σ(valueJPY)`
- `deviation`：`actualWeight - targetWeight`
- `status`：根据阈值标注 `Overweight`/`Underweight`/`Neutral`

## 三、图表与展示
- 饼图：各资产 `actualWeight`
- 柱状图：`actualWeight` vs `targetWeight`，按 `deviation` 着色
- 列表：可筛选（账户、类别、Core/Satellite）

## 四、扩展与演进
- 自动价格抓取：后期接入公共 API（例如 Yahoo/指数代理/自维护报价源）
- 汇率自动更新：如 `exchangerate.host` 免费接口
- 账户聚合：从券商导出文件自动对表头做适配映射
- 导出报告：生成带时间戳的快照 JSON/CSV/PDF

