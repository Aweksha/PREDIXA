import { TriangleAlert } from "lucide-react";

export default function Disclaimer() {
  return (
    <div className="disclaimer" role="note">
      <TriangleAlert size={15} aria-hidden="true" />
      <span>
        <strong>Research project.</strong> PREDIXA can&apos;t yet reliably predict
        stocks. Don&apos;t take anything here at face value or use it as financial
        advice.
      </span>
    </div>
  );
}
