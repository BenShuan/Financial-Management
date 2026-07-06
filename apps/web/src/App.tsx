import { Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AccountLedgerPage } from "@/pages/accounts/AccountLedgerPage";
import { AccountsPage } from "@/pages/accounts/AccountsPage";
import { BudgetLinePage } from "@/pages/budgets/BudgetLinePage";
import { BudgetNewPage } from "@/pages/budgets/BudgetNewPage";
import { BudgetsPage } from "@/pages/budgets/BudgetsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { HouseholdPage } from "@/pages/HouseholdPage";
import { ImportPage } from "@/pages/imports/ImportPage";
import { MorePage } from "@/pages/MorePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ReconciliationPage } from "@/pages/reconciliation/ReconciliationPage";
import { RecurringPage } from "@/pages/RecurringPage";
import { TransactionNewPage } from "@/pages/transactions/TransactionNewPage";
import { TransactionsPage } from "@/pages/transactions/TransactionsPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="accounts/:accountId" element={<AccountLedgerPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="transactions/new" element={<TransactionNewPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="budgets/new" element={<BudgetNewPage />} />
        <Route path="budgets/lines/:budgetLineId" element={<BudgetLinePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="reconciliation/:reconciliationId" element={<ReconciliationPage />} />
        <Route path="recurring" element={<RecurringPage />} />
        <Route path="household" element={<HouseholdPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
