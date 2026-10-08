import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
    {/* BrowserRouter wraps the other providers so anything added below it can use Link,
        useNavigate and useLocation. Nesting it innermost puts every provider outside the
        router, where those hooks throw. Add new providers inside it; keep Routes last. */}
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster
            position="bottom-right"
            offset={64}
            theme="dark"
            toastOptions={{
              style: {
                background: "rgba(18, 22, 38, 0.92)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#edf1fb",
                backdropFilter: "blur(12px)",
              },
            }}
          />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
