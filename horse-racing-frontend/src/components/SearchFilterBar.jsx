import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

const SearchFilterBar = ({
  onSearch,
  onFilterChange,
  initialValue = "",
  placeholder = "Search horses, jockeys, or tournaments...",
  filterOptions = [
    { value: "all", label: "All Categories" },
    { value: "active", label: "Active" },
    { value: "upcoming", label: "Upcoming" },
    { value: "completed", label: "Completed" },
  ],
}) => {
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedLabel = filterOptions.find((option) => option.value === selectedFilter)?.label ?? "All Categories";

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (value) => {
    setSelectedFilter(value);
    setIsOpen(false);
    onFilterChange(value);
  };

  return (
    <div className="search-filter-bar">
      <div className="search-filter-bar__field">
        <Search className="search-filter-bar__icon" size={18} aria-hidden="true" />
        <input
          className="search-filter-bar__input"
          type="text"
          placeholder={placeholder}
          value={initialValue}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="search-filter-dropdown" ref={dropdownRef}>
        <button
          className={`search-filter-dropdown__button ${isOpen ? "search-filter-dropdown__button--open" : ""}`}
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>{selectedLabel}</span>
          <ChevronDown className="search-filter-dropdown__chevron" size={18} aria-hidden="true" />
        </button>

        <div className={`search-filter-dropdown__menu ${isOpen ? "search-filter-dropdown__menu--open" : ""}`} role="listbox">
          {filterOptions.map((option) => (
            <button
              className={`search-filter-dropdown__option ${selectedFilter === option.value ? "search-filter-dropdown__option--active" : ""}`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={selectedFilter === option.value}
              onClick={() => handleSelect(option.value)}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchFilterBar;
