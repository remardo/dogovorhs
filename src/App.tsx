import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const Index = lazy(() => import("./pages/Index"));
const Contracts = lazy(() => import("./pages/Contracts"));
const SimCards = lazy(() => import("./pages/SimCards"));
const Employees = lazy(() => import("./pages/Employees"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Companies = lazy(() => import("./pages/Companies"));
const Operators = lazy(() => import("./pages/Operators"));
const Tariffs = lazy(() => import("./pages/Tariffs"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Загрузка…</div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/sim-cards" element={<SimCards />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/operators" element={<Operators />} />
            <Route path="/tariffs" element={<Tariffs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
