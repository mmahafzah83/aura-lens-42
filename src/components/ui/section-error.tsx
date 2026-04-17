interface SectionErrorProps {
  /** Called when the user clicks Retry. */
  onRetry: () => void;
  /** Optional override message before the Retry link. Default: "Failed to load. " */
  message?: string;
  /** Optional override for the link label. Default: "Retry" */
  retryLabel?: string;
  /** Optional className for layout overrides. */
  className?: string;
}

/**
 * Inline error state for a section that failed to load its data.
 * Replaces blank empty states. Pair with try/catch around your loader.
 *
 *   {error ? <SectionError onRetry={load} /> : <YourContent />}
 */
const SectionError = ({
  onRetry,
  message = "Failed to load. ",
  retryLabel = "Retry",
  className,
}: SectionErrorProps) => {
  return (
    <div
      className={className}
      style={{
        padding: "20px 16px",
        textAlign: "center",
        fontSize: 12,
        color: "#777",
        lineHeight: 1.6,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "#F97316",
          cursor: "pointer",
          fontSize: 12,
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
};

export default SectionError;
