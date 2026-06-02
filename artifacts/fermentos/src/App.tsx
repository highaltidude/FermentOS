import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import useUpdateChecker from "@/hooks/useUpdateChecker";
import Dashboard from "@/pages/Dashboard";
import Recipes from "@/pages/Recipes";
import RecipeDetail from "@/pages/RecipeDetail";
import NewRecipe from "@/pages/NewRecipe";
import BrewSessions from "@/pages/BrewSessions";
import BrewSessionDetail from "@/pages/BrewSessionDetail";
import NewBrewSession from "@/pages/NewBrewSession";
import Inventory from "@/pages/Inventory";
import Equipment from "@/pages/Equipment";
import Calculators from "@/pages/Calculators";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function UpdateChecker() {
  useUpdateChecker();
  return null;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/recipes/new" component={NewRecipe} />
        <Route path="/recipes/:id" component={RecipeDetail} />
        <Route path="/recipes" component={Recipes} />
        <Route path="/brew-sessions/new" component={NewBrewSession} />
        <Route path="/brew-sessions/:id" component={BrewSessionDetail} />
        <Route path="/brew-sessions" component={BrewSessions} />
        <Route path="/ingredients" component={Inventory} />
        <Route path="/equipment" component={Equipment} />
        <Route path="/calculators" component={Calculators} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
      <UpdateChecker />
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
        <SonnerToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
