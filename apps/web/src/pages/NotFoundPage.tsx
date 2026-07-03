import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="הדף לא נמצא"
      description="הכתובת הזו לא תואמת אף נתיב באפליקציה."
      action={
        <Button asChild>
          <Link to="/">חזרה לדף הבית</Link>
        </Button>
      }
    />
  );
}
