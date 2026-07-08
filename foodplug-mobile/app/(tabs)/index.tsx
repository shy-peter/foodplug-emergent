import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth';
import {
  emptyDashboardOverview,
  loadDashboardOverview,
  type DashboardOverview,
  type DashboardPeriod,
  type SaleRecord,
} from '@/lib/dashboard';

export default function HomeScreen() {
  const router = useRouter();
  const { user, token, hydrated, logout } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('day');
  const [overview, setOverview] = useState<DashboardOverview>(() => emptyDashboardOverview('day'));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hydrated || !user || !token) return;

    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const nextOverview = await loadDashboardOverview(token, user, period);
        if (active) {
          setOverview(nextOverview);
        }
      } catch (loadError) {
        if (active) {
          const message = loadError instanceof Error ? loadError.message : 'Unable to load dashboard';
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [hydrated, period, token, user]);

  const handleRefresh = async () => {
    if (!user || !token) return;

    setRefreshing(true);
    setError('');
    try {
      const nextOverview = await loadDashboardOverview(token, user, period);
      setOverview(nextOverview);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to refresh dashboard';
      setError(message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const topSales = useMemo(() => overview.recentSales.slice(0, 6), [overview.recentSales]);
  const chartMax = Math.max(...overview.stats.chart.map((point) => point.revenue), 1);

  const summaryCards = useMemo(() => {
    const baseCards = [
      {
        label: 'Revenue',
        value: formatNaira(overview.stats.total_revenue),
        icon: 'cash-outline' as const,
      },
      {
        label: 'Sales',
        value: String(overview.stats.total_sales),
        icon: 'receipt-outline' as const,
      },
      {
        label: user?.role === 'admin' ? 'Customers' : 'Customers seen',
        value: String(overview.stats.customer_sales_count || overview.stats.customers_served || 0),
        icon: 'people-outline' as const,
      },
      {
        label: user?.role === 'admin' ? 'Agents' : 'Your role',
        value: user?.role === 'admin' ? String(overview.stats.total_agents) : capitalize(user?.role || 'sales'),
        icon: 'person-outline' as const,
      },
    ];

    if (user?.role === 'admin') {
      baseCards[2] = {
        label: 'Customers',
        value: String(overview.stats.total_customers),
        icon: 'people-outline' as const,
      };
    }

    return baseCards;
  }, [overview.stats, user?.role]);

  if (hydrated && user?.role === 'sales') {
    return <Redirect href="/sales" />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#D95D39" />}
    >
      <View style={styles.backdropOne} />
      <View style={styles.backdropTwo} />

      <View style={styles.heroCard}>
        {/* <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.eyebrow}>Dashboard</Text>
            <Text style={styles.title}>Welcome, {user?.display_name || 'team member'}</Text>
            <Text style={styles.subtitle}>
              {user?.role === 'admin'
                ? 'Monitor revenue, customers, and agents from one place.'
                : 'Track your sales activity and stay focused on the floor.'}
            </Text>
          </View>

          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{(user?.display_name || 'F')[0].toUpperCase()}</Text>
          </View>
        </View> */}

        <View style={styles.metaRow}>
          <MetaItem label="Role" value={capitalize(user?.role || 'sales')} />
          <MetaItem label="Organization" value={user?.organization_name || 'FoodPlug'} />
        </View>
      </View>

      <View style={styles.periodRow}>
        {(['day', 'month', 'all'] as DashboardPeriod[]).map((value) => {
          const active = period === value;
          return (
            <Pressable
              key={value}
              onPress={() => setPeriod(value)}
              style={({ pressed }) => [styles.periodChip, active && styles.periodChipActive, pressed && styles.periodChipPressed]}
            >
              <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>{periodLabel(value)}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#D95D39" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={22} color="#B22222" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={handleRefresh} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Activity</Text>
            <Text style={styles.sectionTitle}>Revenue trend</Text>
          </View>
          <Text style={styles.sectionCaption}>{overview.stats.chart.length} points</Text>
        </View>

        {overview.stats.chart.length === 0 ? (
          <EmptyState text="No sales recorded for this period yet." />
        ) : (
          <View style={styles.chartWrap}>
            {overview.stats.chart.map((point) => {
              const height = Math.max(8, Math.round((point.revenue / chartMax) * 140));
              return (
                <View key={point.date} style={styles.chartBarGroup}>
                  <View style={[styles.chartBar, { height }]} />
                  <Text style={styles.chartDate}>{shortDate(point.date)}</Text>
                  <Text style={styles.chartValue}>{formatCompactNaira(point.revenue)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Latest</Text>
            <Text style={styles.sectionTitle}>Recent sales</Text>
          </View>
          <Text style={styles.sectionCaption}>{topSales.length} shown</Text>
        </View>

        {topSales.length === 0 ? (
          <EmptyState text="No sales to show yet." />
        ) : (
          <View style={styles.salesList}>
            {topSales.map((sale) => (
              <SaleRow key={sale.id} sale={sale} />
            ))}
          </View>
        )}
      </View>

      {user?.role === 'admin' ? (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Leaders</Text>
              <Text style={styles.sectionTitle}>Top customers</Text>
            </View>
            <Text style={styles.sectionCaption}>{overview.stats.top_customers.length} shown</Text>
          </View>

          {overview.stats.top_customers.length === 0 ? (
            <EmptyState text="Top customer data will appear here once customer sales exist." />
          ) : (
            <View style={styles.customerList}>
              {overview.stats.top_customers.map((customer) => (
                <View key={customer.customer_id} style={styles.customerRow}>
                  <View style={styles.customerRank}>
                    <Text style={styles.customerRankText}>{customer.meals}</Text>
                  </View>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName}>{customer.customer_name}</Text>
                    <Text style={styles.customerContractor}>{customer.contractor}</Text>
                  </View>
                  <Text style={styles.customerRevenue}>{formatNaira(customer.revenue)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Session</Text>
        <Text style={styles.sessionEmail}>{user?.email || 'No email'}</Text>
        <Text style={styles.cardCopy}>
          Your session is stored securely on the device so you stay signed in when the app restarts.
        </Text>

        <Pressable onPress={handleLogout} style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}>
          <Text style={styles.logoutButtonText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIconWrap}>
        <Ionicons name={icon} size={18} color="#D95D39" />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SaleRow({ sale }: { sale: SaleRecord }) {
  const isCustomerSale = sale.type === 'customer';
  return (
    <View style={styles.saleRow}>
      <View style={styles.saleDotWrap}>
        <View style={[styles.saleDot, isCustomerSale ? styles.saleDotCustomer : styles.saleDotVisitor]} />
      </View>
      <View style={styles.saleContent}>
        <View style={styles.saleTitleRow}>
          <Text style={styles.saleName}>{sale.customer_name}</Text>
          <Text style={[styles.saleAmount, isCustomerSale ? styles.saleAmountNegative : styles.saleAmountPositive]}>
            {formatSignedNaira(sale.amount)}
          </Text>
        </View>
        <Text style={styles.saleMeta} numberOfLines={1}>
          {sale.contractor || 'No contractor'} - {sale.food_type} - {sale.agent_name}
        </Text>
        <Text style={styles.saleTime}>{relativeTime(sale.created_at)}</Text>
      </View>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="sparkles-outline" size={18} color="#D4A373" />
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

function periodLabel(period: DashboardPeriod) {
  if (period === 'day') return 'Today';
  if (period === 'month') return 'Month';
  return 'All time';
}

function shortDate(date: string) {
  if (!date) return '--';
  return new Intl.DateTimeFormat('en-NG', { month: 'short', day: 'numeric' }).format(new Date(date));
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatNaira(amount: number | string | null | undefined) {
  const nextAmount = Number(amount || 0);
  return `₦${Math.abs(nextAmount).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function formatSignedNaira(amount: number | string | null | undefined) {
  const nextAmount = Number(amount || 0);
  const formatted = formatNaira(nextAmount);
  return nextAmount < 0 ? `-${formatted}` : formatted;
}

function formatCompactNaira(amount: number | string | null | undefined) {
  const nextAmount = Number(amount || 0);
  if (nextAmount >= 1_000_000) {
    return `₦${(nextAmount / 1_000_000).toFixed(1)}m`;
  }
  if (nextAmount >= 1_000) {
    return `₦${(nextAmount / 1_000).toFixed(1)}k`;
  }
  return formatNaira(nextAmount);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9F8F6',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 28,
  },
  backdropOne: {
    position: 'absolute',
    top: 0,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: 'rgba(217, 93, 57, 0.08)',
  },
  backdropTwo: {
    position: 'absolute',
    top: 200,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(44, 66, 63, 0.06)',
  },
  heroCard: {
    backgroundColor: '#2C423F',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    color: '#D4A373',
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255, 244, 229, 0.82)',
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  metaItem: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: '#D95D39',
    paddingLeft: 10,
  },
  metaLabel: {
    color: 'rgba(212, 163, 115, 0.88)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: '#FFFFFF',
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8E6E1',
  },
  cardLabel: {
    color: '#5C5C59',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
    fontWeight: '800',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 10,
  },
  periodChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E6E1',
  },
  periodChipActive: {
    backgroundColor: '#2C423F',
    borderColor: '#2C423F',
  },
  periodChipPressed: {
    opacity: 0.92,
  },
  periodChipText: {
    color: '#5C5C59',
    fontSize: 13,
    fontWeight: '800',
  },
  periodChipTextActive: {
    color: '#FFFFFF',
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E6E1',
    gap: 12,
  },
  loadingText: {
    color: '#5C5C59',
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(178, 34, 34, 0.18)',
    gap: 10,
  },
  errorText: {
    color: '#8B1A1A',
    fontWeight: '700',
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#D95D39',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E6E1',
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F9F1EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: '#2C423F',
    marginTop: 14,
    fontSize: 22,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#5C5C59',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  cardValue: {
    color: '#2C423F',
    marginTop: 8,
    fontSize: 20,
    fontWeight: '900',
  },
  cardCopy: {
    color: '#5C5C59',
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionEyebrow: {
    color: '#D95D39',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#2C423F',
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionCaption: {
    color: '#5C5C59',
    fontSize: 12,
    fontWeight: '700',
  },
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 220,
    paddingTop: 6,
  },
  chartBarGroup: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  chartBar: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#D95D39',
    minHeight: 8,
  },
  chartDate: {
    color: '#5C5C59',
    fontSize: 11,
    fontWeight: '700',
  },
  chartValue: {
    color: '#2C423F',
    fontSize: 10,
    fontWeight: '800',
  },
  salesList: {
    gap: 14,
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 2,
  },
  saleDotWrap: {
    paddingTop: 5,
  },
  saleDot: {
    width: 12,
    height: 12,
    borderRadius: 12,
  },
  saleDotCustomer: {
    backgroundColor: '#D95D39',
  },
  saleDotVisitor: {
    backgroundColor: '#4F7942',
  },
  saleContent: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEAE2',
    paddingBottom: 12,
  },
  saleTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  saleName: {
    flex: 1,
    color: '#2C423F',
    fontSize: 15,
    fontWeight: '800',
  },
  saleAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  saleAmountNegative: {
    color: '#D95D39',
  },
  saleAmountPositive: {
    color: '#4F7942',
  },
  saleMeta: {
    color: '#5C5C59',
    marginTop: 4,
    fontSize: 12,
  },
  saleTime: {
    color: '#8A8A86',
    marginTop: 5,
    fontSize: 11,
    fontWeight: '600',
  },
  customerList: {
    gap: 12,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerRank: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F9F1EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerRankText: {
    color: '#D95D39',
    fontSize: 12,
    fontWeight: '900',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    color: '#2C423F',
    fontSize: 15,
    fontWeight: '800',
  },
  customerContractor: {
    color: '#5C5C59',
    marginTop: 3,
    fontSize: 12,
  },
  customerRevenue: {
    color: '#2C423F',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#F9F8F6',
    padding: 14,
  },
  emptyStateText: {
    color: '#5C5C59',
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  sessionEmail: {
    color: '#2C423F',
    marginTop: 8,
    fontSize: 20,
    fontWeight: '900',
  },
  logoutButton: {
    marginTop: 18,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#D95D39',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonPressed: {
    opacity: 0.88,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
