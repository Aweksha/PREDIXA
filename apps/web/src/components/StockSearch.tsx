import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

type TickerSuggestion = {
  symbol: string;
  name: string;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5050").replace(/\/$/, "");

export default function StockSearch() {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setSuggestions([]);
      setShowDropdown(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        setLoading(true);

        const res = await fetch(
          `${API_BASE}/api/tickers/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          throw new Error("failed to fetch ticker suggestions");
        }

        const data: TickerSuggestion[] = await res.json();
        setSuggestions(data);
        setShowDropdown(true);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("autocomplete error:", error);
          setSuggestions([]);
          setShowDropdown(false);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function goToTicker(symbol: string) {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) return;

    setShowDropdown(false);
    navigate(`/dashboard/${cleanSymbol}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (activeIndex >= 0 && activeIndex < suggestions.length) {
      goToTicker(suggestions[activeIndex].symbol);
      return;
    }

    goToTicker(query);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        goToTicker(query);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev + 1;
        return next >= suggestions.length ? 0 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? suggestions.length - 1 : next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        goToTicker(suggestions[activeIndex].symbol);
      } else {
        goToTicker(query);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  return (
    <div ref={wrapperRef} className="search-box">
      <Search className="search-icon" size={20} aria-hidden="true" />
      <form onSubmit={handleSubmit}>
        <input
          className="field search-input"
          type="text"
          value={query}
          placeholder="Search ticker or company"
          aria-label="Search stocks"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
      </form>

      {loading && <div className="search-status">Searching…</div>}

      {showDropdown && !loading && suggestions.length === 0 && query.trim() ? (
        <div className="search-menu search-empty">
          No supported stock matched that search.
        </div>
      ) : null}

      {showDropdown && suggestions.length > 0 && (
        <div className="search-menu">
          {suggestions.map((item, index) => (
            <button
              key={`${item.symbol}-${item.name}`}
              type="button"
              className={`search-option${
                index === activeIndex ? " search-option-active" : ""
              }`}
              onClick={() => goToTicker(item.symbol)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="search-option-symbol">{item.symbol}</span>
              <span className="search-option-name">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
