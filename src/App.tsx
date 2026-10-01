import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ConvexProvider } from "convex/react";
import { convexClient } from "@/lib/backend";
import QueryErrorBoundary from "@/components/QueryErrorBoundary";

const Index = lazy(() => import("./pages/Index"));
const Contracts = lazy(() => import("./pages/Contracts"));
const SimCards = lazy(() => import("./pages/SimCards"));
const Employees = lazy(() => import("./pages/Employees"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Companies = lazy(() => import("./pages/Companies"));
const Operators = lazy(() => import("./pages/Operators"));
const Tariffs = lazy(() => import("./pages/Tariffs"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Error boundary sits ABOVE all routed pages (not inside layouts), so a
// failed/offline reactive query in any page hook or layout hook can never
// blank the UI. Keyed by route: navigation resets the boundary and the retry
// button returns to a working route.
const RoutesWithBoundary = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <QueryErrorBoundary
      key={location.pathname}
      onReset={() => navigate("/", { replace: true })}
      resetLabel="На главную"
    >
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Загрузка:</div>}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/sim-cards" element={<SimCards />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/operators" element={<Operators />} />
          <Route path="/tariffs" element={<Tariffs />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </QueryErrorBoundary>
  );
};

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      {convexClient ? (
        <ConvexProvider client={convexClient}>
          <RoutesWithBoundary />
        </ConvexProvider>
      ) : (
        <RoutesWithBoundary />
      )}
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
