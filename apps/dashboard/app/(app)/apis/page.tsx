import { getTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ApiListClient } from "./_components/api-list-client";
import { DEFAULT_OVERVIEW_FETCH_LIMIT } from "./_components/constants";
import { fetchApiOverview } from "./actions";
import { Navigation } from "./navigation";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type Props = {
  searchParams: { new?: boolean };
};

/**
 * API概览页面组件
 * 展示workspace下的所有API列表
 * 处理租户验证和付费计划检查
 */
export default async function ApisOverviewPage(props: Props) {
  // 获取当前租户ID
  const tenantId = getTenantId();

  // 查询当前工作区信息
  const workspace = await db.query.workspaces.findFirst({
    where: (table, { and, eq, isNull }) =>
      and(eq(table.tenantId, tenantId), isNull(table.deletedAtM)),
  });

  // 如果没有工作区则重定向到新建页面
  if (!workspace) {
    return redirect("/new");
  }

  // 获取API概览初始数据
  const initialData = await fetchApiOverview({
    workspaceId: workspace.id,
    limit: DEFAULT_OVERVIEW_FETCH_LIMIT,
  });
  
  // 检查是否是未付费的组织账户
  const unpaid = workspace.tenantId.startsWith("org_") && workspace.plan === "free";

  return (
    <div>
      <Navigation isNewApi={!!props.searchParams.new} apisLength={initialData.total} />
      <ApiListClient initialData={initialData} unpaid={unpaid} />
    </div>
  );
}
