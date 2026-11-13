export function blankMenuRow(inherit = {}) {
  return {
    name: '',
    category: inherit.category || '',
    price: inherit.price ?? 0,
    priceFoodpanda: inherit.priceFoodpanda ?? 0,
    sortOrder: inherit.sortOrder ?? 0,
    active: inherit.active ?? true,
    imageUrl: '',
    discount: inherit.discount ?? 0,
  }
}

export const emptyMenuForm = () => ({
  name: '',
  category: '',
  price: 0,
  priceFoodpanda: 0,
  sortOrder: 0,
  active: true,
  imageUrl: '',
  discount: 0,
})
