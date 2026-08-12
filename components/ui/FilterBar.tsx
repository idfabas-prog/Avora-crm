type FilterBarProps = {
  filters: Array<{ label: string; options: string[] }>;
};

export function FilterBar({ filters }: FilterBarProps) {
  return (
    <div className="filter-bar">
      {filters.map((filter) => (
        <label className="filter-control" key={filter.label}>
          <span>{filter.label}</span>
          <select defaultValue="">
            <option value="">All</option>
            {filter.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
