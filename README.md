# portfolio

Web 版个人股票持仓管理工具（文档与模板）。代码你将自行实现；此处提供需求与数据结构说明，便于外包或自研快速对齐。

## 资源 / 参考
- Google Sheet（旧版）：https://docs.google.com/spreadsheets/d/1UPcx6tNZ9wwjNShGZVBwjoMuqfegmCq8vT5cSiQsyBU/edit?usp=sharing

## 文档
 - PRD（v3）：`docs/PRD_OnePager_v3.md`
- 功能模块 + 字段定义：`docs/Modules_and_Fields.md`
- 实战持仓方法论（个人版·通俗长文）：`docs/methodology.zh.md`

## 模板样例
- 持仓明细：`templates/holdings.example.csv`
- 市场/价格与汇率：`templates/market_data.example.csv`
- 统一配置：`templates/config.example.json`

## 开发与部署（建议）
- 前端：React + Tailwind（或任意你熟悉的框架）
- 图表：Recharts / Chart.js
- 数据源：先用模板导入；后续可接第三方价格/汇率 API
- 部署：GitHub Pages（移动端适配）。仓库根已提供 `index.html` 跳转到 `webapp/`，发布后直接访问仓库 Pages 根即可打开应用。

## 推送到 GitHub（先在网页新建公开仓库 portfolio）
```bash
cd /Users/zhang/Documents/code/portfolio
git add .
git commit -m "docs: add PRD, modules and templates"
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/portfolio.git
git push -u origin main
```

> `.gitignore` 可后续补充；License 选 MIT 较合适。
- 一页极简流程（可立即执行）：`docs/quickstart.zh.md`
