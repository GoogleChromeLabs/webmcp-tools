export interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
    description: string;
    image: string;
    size: 'child' | 'adult';
    tags?: string[];
}
