import BaseDailyPredictions from "../components/BaseDailyPredictions";

export const dynamic = "force-dynamic";

export default function BaseDailyPage() {
  return (
    <main style={{ 
      padding: "2rem 1rem", 
      maxWidth: 1280, 
      margin: "0 auto", 
      display: "flex", 
      flexDirection: "column", 
      gap: "2rem",
      minHeight: "100vh",
      background: "transparent",
      position: "relative"
    }}>
      <BaseDailyPredictions />
    </main>
  );
}

