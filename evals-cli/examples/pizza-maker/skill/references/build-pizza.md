## Recommended Build Order

For best results, build a pizza in this order:
1. `set_pizza_size` — Set the size
2. `set_pizza_style` — Choose a style
3. `toggle_layer` — Add sauce and cheese layers
4. `add_topping` — Add toppings on top of the layers
5. `share_pizza` — Share the finished pizza

Always add sauce and cheese layers before toppings unless the user says otherwise.

## Size Inference

When the user mentions a party size, infer the pizza size for `set_pizza_size`:

| Party size | Pizza size  |
|------------|-------------|
| 1-2 people | Small       |
| 3-4 people | Medium      |
| 5-6 people | Large       |
| 7+ people  | Extra Large |
