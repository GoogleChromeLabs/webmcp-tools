/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Recipe {
  id: string;
  title: string;
  instructions: string; // Recipe steps authored by community members
  ingredients: string[];
  collectionId: string | null;
  dietaryTags: string[];
  sharedWith: string[]; // recipient emails
}

export interface Collection {
  id: string;
  name: string;
}

export interface RecipesState {
  recipes: Recipe[];
  collections: Collection[];
  searchRecipes: (query: string, dietaryTags?: string[]) => Recipe[];
  saveRecipe: (title: string, collectionId?: string) => Recipe;
  moveRecipesToCollection: (recipeIds: string[], collectionId: string) => void;
  addToMealPlan: (recipeIds: string[], dayOfWeek: string) => void;
  shareRecipe: (recipeId: string, email: string) => Promise<void>;
  deleteRecipes: (recipeIds: string[]) => Promise<void>; // permanent deletion
}
