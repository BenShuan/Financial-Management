import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 rounded-card bg-card p-8 shadow-card">
      <h1 className="text-2xl font-semibold tracking-tight">הדף לא נמצא</h1>
      <p className="text-muted-foreground text-sm">
        הכתובת הזו לא תואמת אף נתיב באפליקציה.
      </p>
      <div>
        <Button asChild>
          <Link to="/">חזרה לדף הבית</Link>
        </Button>
      </div>
    </div>
  );
}
