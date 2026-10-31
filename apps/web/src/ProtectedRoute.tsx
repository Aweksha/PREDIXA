import { Navigate } from "react-router-dom";
import { isAuthed } from "./auth";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  if (!isAuthed()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
