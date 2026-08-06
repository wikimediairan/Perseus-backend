import type { FC, PropsWithChildren } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Button } from "@/views/components/Button";
import { Card } from "@/views/components/Card";
import { Layout } from "@/views/layouts/Layout";

export interface DashboardUsageView {
	weeklyCredit: number;
	usedThisWeek: number;
	remainingThisWeek: number;
	nextEvaluationAt: string;
}

export interface DashboardPageProps {
	wikimediaUsername: string;
	status: string;
	keyRequestStatus: string;
	usage: DashboardUsageView | null;
	keyRequest: string | null;
}

function money(value: number): string {
	return `$${value.toFixed(2)}`;
}

const Row: FC<PropsWithChildren<{ label: string }>> = ({ label, children }) => (
	<div class="flex items-center justify-between border-b border-white/5 py-3 last:border-0">
		<dt class="text-sm text-slate-400">{label}</dt>
		<dd class="text-sm font-medium text-slate-100">{children}</dd>
	</div>
);

export function DashboardPage({
	wikimediaUsername,
	status,
	keyRequestStatus,
	usage,
	keyRequest,
}: DashboardPageProps): JSX.Element {
	return (
		<Layout title="Perseus Dashboard">
			<main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16">
				<Card>
					<div class="mb-8 flex items-center justify-between">
						<h1 class="text-2xl font-semibold tracking-tight text-white">
							داشبورد
						</h1>
						<form method="post" action="/auth/logout">
							<Button type="submit" variant="secondary">
								خروج از حساب کاربری
							</Button>
						</form>
					</div>

					<dl>
						<Row label="حساب ویکی‌مدیا">{wikimediaUsername}</Row>
						<Row label="وضعیت حساب">{status}</Row>
						<Row label="وضعیت درخواست دسترسی">{keyRequestStatus}</Row>

						{usage ? (
							<>
								<Row label="اعتبار هفتگی">{money(usage.weeklyCredit)}</Row>
								<Row label="مصرف‌شده در این هفته">
									{money(usage.usedThisWeek)}
								</Row>
								<Row label="باقی‌مانده">{money(usage.remainingThisWeek)}</Row>
								<Row label="ارزیابی بعدی">{usage.nextEvaluationAt}</Row>
							</>
						) : (
							<Row label="وضعیت صف درخواست">
								{keyRequestStatus === "not requested"
									? "هنوز درخواستی ثبت نشده"
									: keyRequestStatus}
							</Row>
						)}
					</dl>

					{!usage && keyRequestStatus === "not requested" ? (
						<>
							<form method="post" action="/api/request-key" class="mt-8">
								<Button type="submit" variant="primary" class="w-full">
									درخواست دسترسی
								</Button>
							</form>
							{keyRequest === "true" && (
								<div class="rounded border p-4">درخواست شما ثبت شد</div>
							)}

							{keyRequest === "false" && (
								<div class="rounded border p-4">ثبت درخواست ناموفق بود</div>
							)}
						</>
					) : null}
				</Card>
			</main>
		</Layout>
	);
}
