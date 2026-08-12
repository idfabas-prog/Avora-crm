export function SearchInput({ placeholder = "Search" }: { placeholder?: string }) {
  return <input className="search-input" placeholder={placeholder} type="search" />;
}
