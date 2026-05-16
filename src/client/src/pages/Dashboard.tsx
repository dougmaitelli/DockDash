import { useDashboard, useStats } from "../hooks/useData";
import { DashboardCanvas } from "../components/dashboard/DashboardCanvas";
import { Page, StatsBar, StatCard } from "../styles/Dashboard.styles";

export default function Dashboard() {
  const { stats } = useStats();
  const {
    services,
    links,
    refresh,
    updatePosition,
    addService,
    updateService,
    addLink,
    updateLink,
    removeLink,
    removeService,
  } = useDashboard();

  return (
    <Page>
      <StatsBar>
        <StatCard>
          <div className="stat-icon" style={{ background: "rgba(59, 130, 246, 0.15)" }}>
            🐳
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.docker || 0}</span>
            <span className="stat-label">Docker Services</span>
          </div>
        </StatCard>
        <StatCard>
          <div className="stat-icon" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
            🌐
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.network || 0}</span>
            <span className="stat-label">Network Services</span>
          </div>
        </StatCard>
        <StatCard>
          <div className="stat-icon" style={{ background: "rgba(139, 92, 246, 0.15)" }}>
            🔗
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.totalLinks || 0}</span>
            <span className="stat-label">Connections</span>
          </div>
        </StatCard>
        <StatCard>
          <div className="stat-icon" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
            ✅
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.up || 0}</span>
            <span className="stat-label">Online</span>
          </div>
        </StatCard>
        <StatCard>
          <div className="stat-icon" style={{ background: "rgba(245, 158, 11, 0.15)" }}>
            📊
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.total || 0}</span>
            <span className="stat-label">Total Services</span>
          </div>
        </StatCard>
      </StatsBar>

      <DashboardCanvas
        services={services}
        links={links}
        refresh={refresh}
        updatePosition={updatePosition}
        addService={addService}
        updateService={updateService}
        addLink={addLink}
        updateLink={updateLink}
        removeLink={removeLink}
        removeService={removeService}
      />
    </Page>
  );
}
