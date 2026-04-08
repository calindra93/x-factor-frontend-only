import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, DollarSign, Package, Eye } from "lucide-react";

export default function MerchAnalytics({ merch }) {
  const now = new Date();
  
  const analytics = useMemo(() => {
    if (!merch || merch.length === 0) return null;

    // Filter available merch (exclude scheduled drops not yet released)
    const availableMerch = merch.filter(m => {
      if (m.status === "Archived") return true; // Include archived in analytics
      if (!m.release_date) return true;
      return new Date(m.release_date) <= now;
    });

    // Include archived merch in long-term analytics
    const totalRevenue = availableMerch.reduce((sum, m) => sum + (m.total_revenue || 0), 0);
    const totalSold = availableMerch.reduce((sum, m) => sum + (m.units_sold || 0), 0);
    const totalManufactured = availableMerch.reduce((sum, m) => sum + (m.units_manufactured || 0), 0);
    const totalCost = availableMerch.reduce((sum, m) => sum + (m.total_manufacturing_cost || 0), 0);
    const profit = totalRevenue - totalCost;
    const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

    // By type breakdown (including archived)
    const byType = {};
    availableMerch.forEach(m => {
      if (!byType[m.merch_type]) {
        byType[m.merch_type] = { sold: 0, revenue: 0, count: 0, archived: 0 };
      }
      byType[m.merch_type].sold += m.units_sold || 0;
      byType[m.merch_type].revenue += m.total_revenue || 0;
      byType[m.merch_type].count += 1;
      if (m.status === "Archived") {
        byType[m.merch_type].archived += 1;
      }
    });

    const typeData = Object.entries(byType).map(([type, data]) => ({
      name: type,
      sold: data.sold,
      revenue: data.revenue,
      count: data.count,
      archived: data.archived
    }));

    // Edition breakdown
    const byEdition = {};
    availableMerch.forEach(m => {
      const edition = m.edition || "Standard";
      if (!byEdition[edition]) {
        byEdition[edition] = { sold: 0, revenue: 0, count: 0 };
      }
      byEdition[edition].sold += m.units_sold || 0;
      byEdition[edition].revenue += m.total_revenue || 0;
      byEdition[edition].count += 1;
    });

    const editionData = Object.entries(byEdition).map(([edition, data]) => ({
      name: edition,
      sold: data.sold,
      revenue: data.revenue,
      count: data.count
    }));

    // Status breakdown
    const active = availableMerch.filter(m => m.status === "Active").length;
    const soldOut = availableMerch.filter(m => m.status === "Sold Out").length;
    const archived = availableMerch.filter(m => m.status === "Archived").length;
    const scheduled = merch.filter(m => m.status === "Scheduled").length;

    const statusData = [
      { name: "Active", value: active, color: "#10b981" },
      { name: "Sold Out", value: soldOut, color: "#f59e0b" },
      { name: "Archived", value: archived, color: "#6b7280" }
    ].filter(d => d.value > 0);

    // Sell-through rates
    const sellThroughData = availableMerch.map(m => ({
      name: m.project_name?.slice(0, 12) || "Item",
      percentage: m.units_manufactured > 0 ? Math.round((m.units_sold / m.units_manufactured) * 100) : 0
    })).sort((a, b) => b.percentage - a.percentage).slice(0, 8);

    // Restock metrics
    const totalRestocks = availableMerch.reduce((sum, m) => sum + (m.restock_count || 0), 0);
    const archivedRevenue = availableMerch
      .filter(m => m.status === "Archived")
      .reduce((sum, m) => sum + (m.total_revenue || 0), 0);

    return {
      totalRevenue,
      totalSold,
      totalManufactured,
      profit,
      roi,
      sellThrough: totalManufactured > 0 ? Math.round((totalSold / totalManufactured) * 100) : 0,
      avgPrice: totalSold > 0 ? Math.round(totalRevenue / totalSold) : 0,
      typeData,
      editionData,
      statusData,
      sellThroughData,
      totalRestocks,
      archivedRevenue,
      scheduled
    };
  }, [merch, now]);

  if (!analytics) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-sm">No merch data available</p>
      </div>
    );
  }

  const COLORS = ["#ef4444", "#f97316", "#eab308", "#10b981", "#0ea5e9", "#8b5cf6"];

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'none' }}>
      {/* KPI Cards - Scaled Down */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-gradient-to-br from-green-950/30 to-black/40 border border-green-900/30 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <DollarSign className="w-3 h-3 text-green-400" />
            <span className="text-gray-400 text-[9px]">Revenue</span>
          </div>
          <p className="text-white text-sm font-bold">${(analytics.totalRevenue / 1000).toFixed(1)}k</p>
        </div>

        <div className="bg-gradient-to-br from-blue-950/30 to-black/40 border border-blue-900/30 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-blue-400" />
            <span className="text-gray-400 text-[9px]">ROI</span>
          </div>
          <p className={`text-sm font-bold ${analytics.roi >= 0 ? "text-green-400" : "text-red-400"}`}>
            {analytics.roi}%
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-950/30 to-black/40 border border-purple-900/30 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <Package className="w-3 h-3 text-purple-400" />
            <span className="text-gray-400 text-[9px]">Units</span>
          </div>
          <p className="text-white text-sm font-bold">{(analytics.totalSold / 1000).toFixed(1)}k</p>
        </div>

        <div className="bg-gradient-to-br from-orange-950/30 to-black/40 border border-orange-900/30 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <Eye className="w-3 h-3 text-orange-400" />
            <span className="text-gray-400 text-[9px]">Sell-Thru</span>
          </div>
          <p className="text-white text-sm font-bold">{analytics.sellThrough}%</p>
        </div>
      </div>

      {/* Revenue by Edition */}
      {analytics.editionData.length > 1 && (
        <div className="bg-gradient-to-br from-red-950/20 to-black/40 border border-red-900/20 rounded-xl p-2">
          <h4 className="text-white text-[10px] font-bold mb-2">Edition Revenue</h4>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={analytics.editionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="name" tick={{ fontSize: 8 }} stroke="#999" />
                <YAxis tick={{ fontSize: 8 }} stroke="#999" />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid #fff2" }} formatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                <Bar dataKey="revenue" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenue by Type */}
      <div className="bg-gradient-to-br from-red-950/20 to-black/40 border border-red-900/20 rounded-xl p-3">
        <h4 className="text-white text-xs font-bold mb-3">Revenue by Type</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={analytics.typeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#999" />
            <YAxis tick={{ fontSize: 10 }} stroke="#999" />
            <Tooltip contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid #fff2" }} />
            <Bar dataKey="revenue" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sell-Through Rate */}
      <div className="bg-gradient-to-br from-red-950/20 to-black/40 border border-red-900/20 rounded-xl p-3">
        <h4 className="text-white text-xs font-bold mb-3">Sell-Through by Item</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={analytics.sellThroughData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#999" />
            <YAxis tick={{ fontSize: 10 }} stroke="#999" />
            <Tooltip contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid #fff2" }} />
            <Bar dataKey="percentage" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Scheduled Drops Notice */}
      {analytics.scheduled > 0 && (
        <div className="bg-gradient-to-br from-purple-950/30 to-black/40 border border-purple-900/30 rounded-lg p-3">
          <p className="text-white text-xs font-semibold">📅 {analytics.scheduled} Upcoming Drop{analytics.scheduled > 1 ? 's' : ''}</p>
          <p className="text-gray-400 text-[9px] mt-1">Scheduled releases not yet in analytics</p>
        </div>
      )}

      {/* Status Distribution */}
      {analytics.statusData.length > 0 && (
        <div className="bg-gradient-to-br from-red-950/20 to-black/40 border border-red-900/20 rounded-xl p-3">
          <h4 className="text-white text-xs font-bold mb-3">Merch Status</h4>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie
                data={analytics.statusData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={50}
                dataKey="value"
                label={({ name, value }) => `${name} (${value})`}
              >
                {analytics.statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Profit Summary */}
      <div className="bg-gradient-to-br from-emerald-950/30 to-black/40 border border-emerald-900/30 rounded-lg p-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-400 mb-1">Total Profit</p>
            <p className={`font-bold text-lg ${analytics.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
              ${analytics.profit.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Avg Price</p>
            <p className="text-white font-bold text-lg">${analytics.avgPrice}</p>
          </div>
        </div>
      </div>

      {/* Long-Term Analytics */}
      {analytics.totalRestocks > 0 || analytics.archivedRevenue > 0 && (
        <div className="bg-gradient-to-br from-blue-950/30 to-black/40 border border-blue-900/30 rounded-lg p-3">
          <h4 className="text-white text-xs font-bold mb-2">Long-Term Metrics</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-gray-400 mb-1">Total Restocks</p>
              <p className="text-white font-bold">{analytics.totalRestocks}</p>
            </div>
            <div>
              <p className="text-gray-400 mb-1">Archived Revenue</p>
              <p className="text-white font-bold">${analytics.archivedRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}