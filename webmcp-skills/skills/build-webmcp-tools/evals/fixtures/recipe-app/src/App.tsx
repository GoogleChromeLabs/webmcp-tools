/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Route, Routes } from "react-router";
import { RecipeList } from "./components/RecipeList";
import { RecipeDetail } from "./components/RecipeDetail";
import { CollectionSidebar } from "./components/CollectionSidebar";
import { ShareRecipeDialog } from "./components/ShareRecipeDialog";
import { MealPlanView } from "./components/MealPlanView";

export function App() {
  return (
    <BrowserRouter>
      <CollectionSidebar />
      <Routes>
        <Route path="/" element={<RecipeList />} />
        <Route path="/collections/:collectionId" element={<RecipeList />} />
        <Route path="/recipes/:recipeId" element={<RecipeDetail />} />
        <Route path="/recipes/:recipeId/share" element={<ShareRecipeDialog />} />
        <Route path="/search" element={<RecipeList />} />
        <Route path="/meal-plan" element={<MealPlanView />} />
      </Routes>
    </BrowserRouter>
  );
}
