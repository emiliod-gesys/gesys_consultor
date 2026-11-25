import { connection } from "next/server";
import { Suspense } from "react";
import { LoginForm } from "@/app/login/login-form";

export const metadata = {
  title: "Entrar",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <LoginScreen />
    </Suspense>
  );
}

async function LoginScreen() {
  await connection();
  const configured = (process.env.APP_PASSWORD ?? "").length >= 8;
  return <LoginForm configured={configured} />;
}
