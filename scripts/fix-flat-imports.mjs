import fs from 'fs'
import path from 'path'

const root = path.resolve('src')
const files = []
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (/\.(jsx?|tsx?)$/.test(ent.name)) files.push(p)
  }
}
walk(root)

function rewrite(code, rel) {
  let out = code
  const inPages = rel.startsWith('pages/')
  const inComponents = rel.startsWith('components/')
  const inUtils = rel.startsWith('utils/')

  // Global path renames (anywhere)
  out = out
    .replaceAll('utils/sales/cartUtils', 'utils/cartUtils')
    .replaceAll('utils/sales/printUtils', 'utils/printUtils')
    .replaceAll('components/sales/', 'components/')
    .replaceAll('components/ui/PageHero', 'components/UiPageHero')

  if (inPages) {
    // pages were nested 2–3 levels; now flat → one ../ to src roots
    out = out.replace(/from (['"])\.\.\/\.\.\/\.\.\/(components|utils|state|hooks|layout)\//g, 'from $1../$2/')
    out = out.replace(/from (['"])\.\.\/\.\.\/(components|utils|state|hooks|layout)\//g, 'from $1../$2/')
    out = out.replace(/from (['"])\.\.\/customers\/customerLedgerUtils\.js\1/g, "from '../utils/customerLedgerUtils.js'")
    out = out.replace(/from (['"])\.\.\/\.\.\/customers\/customerLedgerUtils\.js\1/g, "from '../utils/customerLedgerUtils.js'")
    out = out.replace(/from (['"])\.\/DailyStockView\.jsx\1/g, "from '../components/DailyStockView.jsx'")
    out = out.replace(/from (['"])\.\/kdsSounds\.js\1/g, "from '../utils/kdsSounds.js'")
    out = out.replace(/from (['"])\.\/expenseVoucherDoc\.js\1/g, "from '../utils/expenseVoucherDoc.js'")
    out = out.replace(/from (['"])\.\/menuFormUtils\.js\1/g, "from '../utils/menuFormUtils.js'")
    out = out.replace(/from (['"])\.\/warehouseApi\.js\1/g, "from '../utils/warehouseApi.js'")
    out = out.replace(/from (['"])\.\/myWorkPages\.js\1/g, "from '../utils/myWorkPages.js'")
    out = out.replace(/from (['"])\.\/myWorkShared\.jsx?\1/g, "from '../components/MyWorkShared.jsx'")
    out = out.replace(/from (['"])\.\/components\//g, "from '../components/")
    out = out.replace(/from (['"])\.\/tabs\//g, "from '../components/")
    out = out.replace(/from (['"])\.\/utils\//g, "from '../utils/")
    out = out.replace(/from (['"])\.\.\/ReportHub\.jsx\1/g, "from '../components/ReportHub.jsx'")
    out = out.replace(/from (['"])\.\/ReportHub\.jsx\1/g, "from '../components/ReportHub.jsx'")

    if (rel === 'pages/SalesReports.jsx') {
      out = out
        .replace(/from (['"])\.\/types\.js\1/g, "from '../utils/reportSalesTypes.js'")
        .replace(/from (['"])\.\/engine\.js\1/g, "from '../utils/reportSalesEngine.js'")
        .replace(/from (['"])\.\.\/ReportHub\.jsx\1/g, "from '../components/ReportHub.jsx'")
        .replace(/from (['"])\.\/ReportHub\.jsx\1/g, "from '../components/ReportHub.jsx'")
    }
    if (rel === 'pages/InventoryReports.jsx') {
      out = out
        .replace(/from (['"])\.\/types\.js\1/g, "from '../utils/reportInventoryTypes.js'")
        .replace(/from (['"])\.\/engine\.js\1/g, "from '../utils/reportInventoryEngine.js'")
        .replace(/from (['"])\.\.\/ReportHub\.jsx\1/g, "from '../components/ReportHub.jsx'")
    }
    if (rel === 'pages/ConsumptionReports.jsx') {
      out = out
        .replace(/from (['"])\.\/types\.js\1/g, "from '../utils/reportConsumptionTypes.js'")
        .replace(/from (['"])\.\/engine\.js\1/g, "from '../utils/reportConsumptionEngine.js'")
        .replace(/from (['"])\.\.\/ReportHub\.jsx\1/g, "from '../components/ReportHub.jsx'")
    }

    // HQ BranchModal etc that lived beside pages
    out = out.replace(/from (['"])\.\/BranchModal\.jsx\1/g, "from '../components/BranchModal.jsx'")
    out = out.replace(/from (['"])\.\/WarehouseItemModal\.jsx\1/g, "from '../components/WarehouseItemModal.jsx'")
    out = out.replace(/from (['"])\.\/WarehousePaymentModal\.jsx\1/g, "from '../components/WarehousePaymentModal.jsx'")
    out = out.replace(/from (['"])\.\/WarehousePurchaseModal\.jsx\1/g, "from '../components/WarehousePurchaseModal.jsx'")
    out = out.replace(/from (['"])\.\/WarehouseSupplierModal\.jsx\1/g, "from '../components/WarehouseSupplierModal.jsx'")
    out = out.replace(/from (['"])\.\/MenuAddDialog\.jsx\1/g, "from '../components/MenuAddDialog.jsx'")
    out = out.replace(/from (['"])\.\/MenuEditDialog\.jsx\1/g, "from '../components/MenuEditDialog.jsx'")
  }

  if (inComponents) {
    out = out.replace(/from (['"])\.\.\/\.\.\/\.\.\/(components|utils|state|hooks)\//g, 'from $1../$2/')
    out = out.replace(/from (['"])\.\.\/\.\.\/(utils|state|hooks)\//g, 'from $1../$2/')
    out = out.replace(/from (['"])\.\.\/\.\.\/components\//g, "from './")
    out = out.replace(/from (['"])\.\/shared\/common\.js\1/g, "from '../utils/reportCommon.js'")
    out = out.replace(/from (['"])\.\/engines\/common\.js\1/g, "from '../utils/reportCommon.js'")
    // staff tab/dialog sibling imports
    out = out.replace(/from (['"])\.\.\/components\//g, "from './")
    out = out.replace(/from (['"])\.\.\/utils\/(printSalarySlip|printStaffSummary|salaryCalc)\.js\1/g, "from '../utils/$2.js'")
    out = out.replace(/from (['"])\.\.\/\.\.\/utils\/(printSalarySlip|printStaffSummary|salaryCalc)\.js\1/g, "from '../utils/$2.js'")
    out = out.replace(/from (['"])\.\/utils\/(printSalarySlip|printStaffSummary|salaryCalc)\.js\1/g, "from '../utils/$2.js'")
    // MyWorkShared previously under pages/my
    out = out.replace(/from (['"])\.\/myWorkPages\.js\1/g, "from '../utils/myWorkPages.js'")
  }

  if (inUtils) {
    out = out.replace(/from (['"])\.\/print\//g, "from './")
    out = out.replace(/from (['"])\.\.\/cartUtils\.js\1/g, "from './cartUtils.js'")
    out = out.replace(/from (['"])\.\.\/shared\/common\.js\1/g, "from './reportCommon.js'")
    out = out.replace(/from (['"])\.\.\/\.\.\/customers\/customerLedgerUtils\.js\1/g, "from './customerLedgerUtils.js'")
    out = out.replace(/from (['"])\.\.\/reportDoc\.js\1/g, "from './reportDoc.js'")
    out = out.replace(/from (['"])\.\.\/\.\.\/utils\/reportDoc\.js\1/g, "from './reportDoc.js'")
  }

  return out
}

// Fix App.jsx page imports to flat paths
function rewriteApp(code) {
  return code
    .replace(/from '(\.\/pages)\/(?:sales|inventory|reports\/sales|reports\/inventory|reports\/consumption|reports|supply|staff|my|expenses|riders|settings|users|suppliers|customers|tables|menu|hq|warehouse)\/([^']+)'/g, "from './pages/$2'")
    .replace(/from '(\.\/pages)\/my\/myWorkShared\.jsx'/g, "from './components/MyWorkShared.jsx'")
}

let changed = 0
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/')
  let code = fs.readFileSync(file, 'utf8')
  let next = rewrite(code, rel)
  if (rel === '../App.jsx' || file.endsWith(`${path.sep}App.jsx`) || file.endsWith('/App.jsx')) {
    // App is in src/App.jsx
  }
  if (next !== code) {
    fs.writeFileSync(file, next)
    changed++
    console.log('updated', rel)
  }
}

const appPath = path.resolve('src/App.jsx')
let app = fs.readFileSync(appPath, 'utf8')
const app2 = rewriteApp(app)
if (app2 !== app) {
  fs.writeFileSync(appPath, app2)
  console.log('updated App.jsx')
  changed++
}

console.log('DONE changed=', changed)
