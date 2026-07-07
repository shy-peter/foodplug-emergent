import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/auth";
import {
  loadSalesCustomers,
  loadSalesHistory,
  loadSalesRecords,
  registerCustomerMeal,
  registerVisitorMeal,
  type SaleRecord,
  type SalesCustomer,
  type SalesHistory,
} from "@/lib/sales";

type Mode = "name" | "pin" | "visitor";
type SelectedProfile =
  | SalesCustomer
  | { id: "__visitors__"; name: string; contractor: string; pin: string };

const VISITOR_PROFILE: SelectedProfile = {
  id: "__visitors__",
  name: "Unregistered users",
  contractor: "Visitor profile",
  pin: "-",
};

const SCREEN_REQUEST_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), SCREEN_REQUEST_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]);
}

export default function SalesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, hydrated, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("name");
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [agentSales, setAgentSales] = useState<SaleRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<SelectedProfile | null>(null);
  const [history, setHistory] = useState<SalesHistory | null>(null);
  const [statsFilter, setStatsFilter] = useState<
    "today" | "yesterday" | "all" | "day" | "month"
  >("today");
  const [selectedDay, setSelectedDay] = useState(() =>
    toLocalDateKey(new Date()),
  );
  const [selectedMonth, setSelectedMonth] = useState(() =>
    toLocalMonthKey(new Date()),
  );
  const [foodType, setFoodType] = useState<"soft" | "hard" | "">("");
  const [foodTypeError, setFoodTypeError] = useState("");
  const [amount, setAmount] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [error, setError] = useState("");
  const [saleFlashOpacity] = useState(() => new Animated.Value(0));
  const keyboardOffset = Math.max(insets.top, 12) + 62;

  const triggerSaleFlash = () => {
    saleFlashOpacity.stopAnimation();
    saleFlashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(saleFlashOpacity, {
        toValue: 0.55,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(saleFlashOpacity, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const getCustomersAttendedCount = (
    sales: Array<{ type: string; customer_id?: string | null }>,
  ) =>
    new Set(
      sales
        .filter(
          (sale) =>
            sale.type === "customer" &&
            String(sale.customer_id || "").trim().length > 0,
        )
        .map((sale) => String(sale.customer_id)),
    ).size;

  const refreshMetricsSales = async (
    nextToken: string,
    nextUserId: string,
    mounted = true,
  ) => {
    const nextSales = await withTimeout(
      loadSalesRecords(nextToken, {
        agent_id: nextUserId,
      }),
      "Timed out while loading your sales metrics.",
    );
    if (mounted) {
      setAgentSales(Array.isArray(nextSales) ? nextSales : []);
    }
  };

  useEffect(() => {
    if (!hydrated || !user || !token) return;

    let active = true;

    const bootstrap = async () => {
      setLoadingCustomers(true);
      try {
        const [nextCustomers, nextSales] = await Promise.all([
          withTimeout(loadSalesCustomers(token), "Timed out while loading customers."),
          withTimeout(
            loadSalesRecords(token, { agent_id: user.id }),
            "Timed out while loading your sales metrics.",
          ),
        ]);

        if (!active) return;
        setCustomers(nextCustomers);
        setAgentSales(Array.isArray(nextSales) ? nextSales : []);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load sales screen",
          );
        }
      } finally {
        if (active) {
          setLoadingCustomers(false);
        }
      }
    };

    void bootstrap();

    const intervalId = setInterval(() => {
      void refreshMetricsSales(token, user.id).catch(() => {
        // Keep the screen usable even if a refresh fails.
      });
    }, 15000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [hydrated, token, user]);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        customer.contractor.toLowerCase().includes(query),
    );
  }, [customers, searchTerm]);

  const filteredMetricSales = useMemo(
    () =>
      agentSales.filter((sale) =>
        matchesPeriod(sale.created_at, statsFilter, selectedDay, selectedMonth),
      ),
    [agentSales, selectedDay, selectedMonth, statsFilter],
  );

  const mealsServedMetric = filteredMetricSales.length;
  const customersAttendedMetric =
    getCustomersAttendedCount(filteredMetricSales);

  const isVisitor = selected?.id === VISITOR_PROFILE.id;
  const filteredSales = useMemo(() => {
    const sales = Array.isArray(history?.sales) ? history.sales : [];
    return sales.filter((sale) =>
      matchesPeriod(sale.created_at, statsFilter, selectedDay, selectedMonth),
    );
  }, [history, selectedDay, selectedMonth, statsFilter]);
  
  const visibleSales = useMemo(() => {
    if (showAllTransactions) return filteredSales;
    return filteredSales.slice(0, 3);
  }, [filteredSales, showAllTransactions]);
  
  useEffect(() => {
    setShowAllTransactions(false);
  }, [selected?.id, statsFilter, selectedDay, selectedMonth]);

  const totalSpent = filteredSales.reduce(
    (sum, sale) => sum + Math.abs(Number(sale.amount || 0)),
    0,
  );
  const paid = Number(history?.customer?.balance_credited || 0);
  const outstanding = Math.max(0, totalSpent - paid);
  const indicatorMealsCount = filteredSales.length;

  if (hydrated && user?.role === "admin") {
    return <Redirect href="/(tabs)" />;
  }

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const openCustomer = async (customer: SalesCustomer) => {
    setError("");
    setSelected(customer);
    setStatsFilter("today");
    setSelectedDay(toLocalDateKey(new Date()));
    setSelectedMonth(toLocalMonthKey(new Date()));
    setFoodType("");
    setFoodTypeError("");
    setAmount("");
    setLoadingHistory(true);
    try {
      const nextHistory = await withTimeout(
        loadSalesHistory(token!, customer.id),
        "Timed out while loading customer history.",
      );
      setHistory(nextHistory);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load history",
      );
      setHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openVisitor = async () => {
    setError("");
    setSelected(VISITOR_PROFILE);
    setStatsFilter("today");
    setSelectedDay(toLocalDateKey(new Date()));
    setSelectedMonth(toLocalMonthKey(new Date()));
    setFoodType("");
    setFoodTypeError("");
    setAmount("");
    setLoadingHistory(true);
    try {
      const nextSales = await withTimeout(
        loadSalesRecords(token!),
        "Timed out while loading visitor profile.",
      );
      const visitorSales = nextSales.filter((sale) => sale.type === "visitor");
      setHistory({
        customer: {
          id: VISITOR_PROFILE.id,
          organization_id: user?.organization_id || "",
          name: VISITOR_PROFILE.name,
          contractor: VISITOR_PROFILE.contractor,
          pin: VISITOR_PROFILE.pin,
          created_at: new Date().toISOString(),
        },
        sales: visitorSales,
        total_meals: visitorSales.length,
        total_cost: visitorSales.reduce(
          (sum, sale) => sum + Math.abs(Number(sale.amount || 0)),
          0,
        ),
      });
      setMode("visitor");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load visitor profile",
      );
      setHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const backToSearch = () => {
    setSelected(null);
    setHistory(null);
    setStatsFilter("today");
    setSelectedDay(toLocalDateKey(new Date()));
    setSelectedMonth(toLocalMonthKey(new Date()));
    setFoodType("");
    setFoodTypeError("");
    setAmount("");
    setSearchTerm("");
  };

  const confirmPin = async () => {
    const pin = searchTerm.trim();
    if (pin.length < 4) {
      setError("Enter the customer PIN");
      return;
    }

    const matchedCustomer = customers.find((customer) => customer.pin === pin);
    if (!matchedCustomer) {
      setError("No customer found with that PIN");
      return;
    }

    await openCustomer(matchedCustomer);
  };

  const confirmVisitor = async () => {
    await openVisitor();
  };

  const registerMeal = async () => {
    if (!selected || !token || submitting) return;
    if (!user?.id) return;
    if (!foodType) {
      setFoodTypeError("Choose food type before confirming sale");
      setError("Choose soft or hard food");
      return;
    }
    setFoodTypeError("");

    const price = Number(amount);
    if (!price || price < 100 || price > 10000) {
      setError("Amount must be between ₦100 and ₦10,000");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      if (isVisitor) {
        await registerVisitorMeal(token, {
          customer_name: "Unregistered User",
          contractor: "Unregistered",
          food_type: foodType,
          amount: price,
        });
        await openVisitor();
      } else {
        await registerCustomerMeal(token, {
          customer_id: selected.id,
          food_type: foodType,
          amount: price,
        });
        await openCustomer(selected as SalesCustomer);
      }

      void refreshMetricsSales(token, user.id).catch(() => {
        // The optimistic increment already updated the UI.
      });

      triggerSaleFlash();

      setAmount("");
      setFoodType("");
    } catch (registerError) {
      setError(
        registerError instanceof Error ? registerError.message : "Sale failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    if (!token || !user) return;

    setRefreshing(true);
    setError("");

    try {
      const [nextCustomers, nextSales] = await Promise.all([
        withTimeout(loadSalesCustomers(token), "Timed out while loading customers."),
        withTimeout(
          loadSalesRecords(token, { agent_id: user.id }),
          "Timed out while loading your sales metrics.",
        ),
      ]);

      setCustomers(nextCustomers);
      setAgentSales(Array.isArray(nextSales) ? nextSales : []);

      if (selected) {
        setLoadingHistory(true);
        if (selected.id === VISITOR_PROFILE.id) {
          const visitorSales = (
            await withTimeout(
              loadSalesRecords(token),
              "Timed out while loading visitor profile.",
            )
          ).filter((sale) => sale.type === "visitor");
          setHistory({
            customer: {
              id: VISITOR_PROFILE.id,
              organization_id: user.organization_id || "",
              name: VISITOR_PROFILE.name,
              contractor: VISITOR_PROFILE.contractor,
              pin: VISITOR_PROFILE.pin,
              created_at: new Date().toISOString(),
            },
            sales: visitorSales,
            total_meals: visitorSales.length,
            total_cost: visitorSales.reduce(
              (sum, sale) => sum + Math.abs(Number(sale.amount || 0)),
              0,
            ),
          });
        } else {
          const nextHistory = await withTimeout(
            loadSalesHistory(token, selected.id),
            "Timed out while loading customer history.",
          );
          setHistory(nextHistory);
        }
        setLoadingHistory(false);
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh sales screen",
      );
      setLoadingHistory(false);
    } finally {
      setRefreshing(false);
    }
  };

  if (!hydrated) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#D95D39" />
      </View>
    );
  }

  if (!user || !token) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.screenWrap}>
      <View
        style={[styles.fixedHeader, { paddingTop: Math.max(insets.top, 12) }]}
      >
        <View style={styles.header}>
          <View style={styles.headerMark}>
            <Ionicons name="restaurant-outline" size={20} color="#FFF7ED" />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>FoodPlug POS</Text>
            <Text style={styles.headerSubtitle}>
              {user.display_name || "Sales rep"}
              {user.organization_name || user.organization_id ? (
                <Text style={styles.headerOrganizationText}>
                  {" "}
                  - {user.organization_name || user.organization_id}
                </Text>
              ) : null}
            </Text>
          </View>
          <Pressable onPress={handleLogout} style={styles.logoutPill}>
            <Ionicons name="log-out-outline" size={16} color="#2C423F" />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? keyboardOffset : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#D95D39"
              colors={["#D95D39"]}
            />
          }
        >
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Point of sale</Text>
            <Text style={styles.title}>Register a meal</Text>
            <Text style={styles.subtitle}>
              Search a customer by name, confirm with PIN, or open the visitor
              profile.
            </Text>

            <View style={styles.metricRow}>
              <Metric label="Total Meals served" value={String(mealsServedMetric)} />
              <Metric
                label="Customers attended"
                value={`${customersAttendedMetric}/${customers.length}`}
              />
            </View>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={18} color="#B22222" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!selected ? (
            <>
              <View style={styles.modeRow}>
                <ModeChip
                  active={mode === "name"}
                  onPress={() => {
                    setMode("name");
                    setSearchTerm("");
                  }}
                  label="By name"
                />
                <ModeChip
                  active={mode === "pin"}
                  onPress={() => {
                    setMode("pin");
                    setSearchTerm("");
                  }}
                  label="By PIN"
                />
                <ModeChip
                  active={mode === "visitor"}
                  onPress={confirmVisitor}
                  label="Visitor"
                />
              </View>

              {mode === "name" ? (
                <View style={styles.card}>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search-outline" size={18} color="#5C5C59" />
                    <TextInput
                      value={searchTerm}
                      onChangeText={setSearchTerm}
                      placeholder="Search by name or contractor"
                      placeholderTextColor="#8A8A86"
                      style={styles.searchInput}
                    />
                  </View>

                  {searchTerm ? (
                    <View style={styles.resultsList}>
                      {loadingCustomers ? (
                        <ActivityIndicator color="#D95D39" />
                      ) : filteredCustomers.length === 0 ? (
                        <Text style={styles.emptyText}>
                          No matching customers.
                        </Text>
                      ) : (
                        filteredCustomers.slice(0, 20).map((customer) => (
                          <Pressable
                            key={customer.id}
                            onPress={() => openCustomer(customer)}
                            style={styles.customerItem}
                          >
                            <View>
                              <Text style={styles.customerName}>
                                {customer.name}
                              </Text>
                              <Text style={styles.customerContractor}>
                                {customer.contractor}
                              </Text>
                            </View>
                            <Text style={styles.customerPin}>
                              PIN {customer.pin}
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {mode === "pin" ? (
                <View style={styles.card}>
                  <Text style={styles.cardEyebrow}>Enter customer PIN</Text>
                  <TextInput
                    value={searchTerm}
                    onChangeText={(value) =>
                      setSearchTerm(value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="0000"
                    placeholderTextColor="#8A8A86"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={styles.pinInput}
                  />
                  <Pressable onPress={confirmPin} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Confirm PIN</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.profileWrap}>
              <View style={styles.profileHeaderRow}>
                <Pressable onPress={backToSearch} style={styles.backButton}>
                  <Ionicons
                    name="arrow-back-outline"
                    size={16}
                    color="#5C5C59"
                  />
                  <Text style={styles.backButtonText}>Back to search</Text>
                </Pressable>

                <View style={styles.mealIndicatorRow}>
                  {[1, 2, 3, 4, 5].map((slot) => {
                    const isActive = indicatorMealsCount >= slot;
                    const isThreshold = slot === 5 && indicatorMealsCount >= 5;

                    return (
                      <View
                        key={slot}
                        style={[
                          styles.mealIndicatorDot,
                          isActive &&
                            (isThreshold
                              ? styles.mealIndicatorDotActiveRed
                              : styles.mealIndicatorDotActiveGreen),
                        ]}
                      />
                    );
                  })}
                  {indicatorMealsCount > 5 ? (
                    <Text style={styles.mealIndicatorOverflow}>
                      +{indicatorMealsCount - 5}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>
                  {isVisitor ? "Profile" : "Customer"}
                </Text>
                <Text style={styles.profileName}>{selected.name}</Text>
                <Text style={styles.profileContractor}>
                  {selected.contractor}
                </Text>

                <View style={styles.filterRow}>
                  <FilterChip
                    active={statsFilter === "today"}
                    onPress={() => setStatsFilter("today")}
                    label="Today"
                  />
                  <FilterChip
                    active={statsFilter === "yesterday"}
                    onPress={() => setStatsFilter("yesterday")}
                    label="Yesterday"
                  />
                  <FilterChip
                    active={statsFilter === "all"}
                    onPress={() => setStatsFilter("all")}
                    label="All time"
                  />
                </View>

                <View style={styles.filterInputsRow}>
                  <TextInput
                    value={selectedDay}
                    onChangeText={(value) => {
                      setSelectedDay(value);
                      setStatsFilter("day");
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#8A8A86"
                    style={styles.filterInput}
                  />
                  <TextInput
                    value={selectedMonth}
                    onChangeText={(value) => {
                      setSelectedMonth(value);
                      setStatsFilter("month");
                    }}
                    placeholder="YYYY-MM"
                    placeholderTextColor="#8A8A86"
                    style={styles.filterInput}
                  />
                </View>

                <View style={styles.statsRow}>
                  <StatCard
                    label={isVisitor ? "cash pay" : "Meals"}
                    value={String(filteredSales.length)}
                  />
                  <StatCard
                    label={isVisitor ? "Revenue" : "Outstanding balance"}
                    value={formatNaira(isVisitor ? totalSpent : outstanding)}
                    valueColor={
                      isVisitor
                        ? "#2C423F"
                        : outstanding > 0
                          ? "#D95D39"
                          : "#4F7942"
                    }
                  />
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>Register meal</Text>
                <Text style={styles.sectionTitle}>Choose food type</Text>

                <View style={styles.foodRow}>
                  <FoodChip
                    active={foodType === "soft"}
                    onPress={() => {
                      setFoodType("soft");
                      setFoodTypeError("");
                    }}
                    label="Soft food"
                  />
                  <FoodChip
                    active={foodType === "hard"}
                    onPress={() => {
                      setFoodType("hard");
                      setFoodTypeError("");
                    }}
                    label="Hard food"
                  />
                </View>

                {foodTypeError ? (
                  <Text style={styles.foodTypeErrorText}>{foodTypeError}</Text>
                ) : null}

                <Text style={styles.amountLabel}>
                  Amount (₦) {isVisitor ? "" : "stored as negative"}
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="e.g. 1500"
                  placeholderTextColor="#8A8A86"
                  keyboardType="numeric"
                  style={[
                    styles.amountInput,
                    !isVisitor && styles.amountInputCustomer,
                  ]}
                />

                <Pressable
                  onPress={registerMeal}
                  disabled={submitting}
                  style={[
                    styles.primaryButton,
                    isVisitor && styles.primaryButtonVisitor,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.primaryButtonText,
                        isVisitor && styles.primaryButtonTextVisitor,
                      ]}
                    >
                      {isVisitor ? "Pay cash" : "Confirm sale"}
                    </Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {isVisitor ? "Visitor sales" : "Food history"}
                </Text>
                {loadingHistory ? (
                  <ActivityIndicator color="#D95D39" />
                ) : filteredSales.length ? (
                  <View style={styles.historyList}>
                    {visibleSales.map((sale) => (
                      <View key={sale.id} style={styles.historyRow}>
                        <View style={styles.historyMain}>
                          <Text style={styles.historyDate}>
                            {new Intl.DateTimeFormat("en-NG", {
                              day: "2-digit",
                              month: "short",
                            }).format(new Date(sale.created_at))}{" "}
                            {formatShortTime(sale.created_at)}
                          </Text>
                          <Text style={styles.historyFood}>
                            {sale.food_type}
                          </Text>
                        </View>
                        <Text style={styles.historyAmount}>
                          {formatSignedNaira(sale.amount)}
                        </Text>
                      </View>
                    ))}
                    {!showAllTransactions && filteredSales.length > 3 ? (
                      <Pressable
                        onPress={() => setShowAllTransactions(true)}
                        style={styles.showMoreButton}
                      >
                        <Text style={styles.showMoreText}>Show more</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>No meals recorded yet.</Text>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Animated.View
        pointerEvents="none"
        style={[styles.saleSuccessFlash, { opacity: saleFlashOpacity }]}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  valueColor = "#2C423F",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function ModeChip({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeChip, active && styles.modeChipActive]}
    >
      <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterChip({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text
        style={[styles.filterChipText, active && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FoodChip({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.foodChip, active && styles.foodChipActive]}
    >
      <Text style={[styles.foodChipText, active && styles.foodChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatNaira(amount: number | string | null | undefined) {
  const nextAmount = Number(amount || 0);
  return `₦${Math.abs(nextAmount).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatSignedNaira(amount: number | string | null | undefined) {
  const nextAmount = Number(amount || 0);
  const formatted = formatNaira(nextAmount);
  return nextAmount < 0 ? `-${formatted}` : formatted;
}

function formatShortTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(value))
    .replace(/\s/g, "")
    .toLowerCase();
}

function toLocalDateKey(value: Date | string) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return normalized.slice(0, 10);
  }
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalMonthKey(value: Date | string) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
    if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 7);
  }
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function matchesPeriod(
  isoDate: string,
  filter: "today" | "yesterday" | "all" | "day" | "month",
  selectedDay: string,
  selectedMonth: string,
) {
  const dayKey = toLocalDateKey(isoDate);
  const monthKey = toLocalMonthKey(isoDate);
  const todayKey = toLocalDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);

  if (filter === "today") return dayKey === todayKey;
  if (filter === "yesterday") return dayKey === yesterdayKey;
  if (filter === "day") return dayKey === selectedDay;
  if (filter === "month") return monthKey === selectedMonth;
  return true;
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    backgroundColor: "#F9F8F6",

  },
  showMoreButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  showMoreText: {
    color: "#D95D39",
    fontWeight: "700",
    fontSize: 13,
  },
  fixedHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: "#F9F8F6",
    borderBottomWidth: 1,
    borderBottomColor: "#E8E6E1",
  },
  screen: {
    flex: 1,
    backgroundColor: "#F9F8F6",
  },
  saleSuccessFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#16A34A",
    opacity: 0,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9F8F6",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D95D39",
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    color: "#2C423F",
    fontSize: 20,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: "#5C5C59",
    marginTop: 2,
    fontSize: 13,
  },
  headerOrganizationText: {
    color: "#D95D39",
  },
  logoutPill: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8E6E1",
  },
  heroCard: {
    backgroundColor: "#2C423F",
    borderRadius: 28,
    padding: 22,
    gap: 8,
  },
  eyebrow: {
    color: "#D4A373",
    textTransform: "uppercase",
    letterSpacing: 2.5,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(255, 244, 229, 0.84)",
    fontSize: 14,
    lineHeight: 20,
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 14,
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  metricLabel: {
    color: "rgba(255,255,255,0.72)",
    marginTop: 4,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "rgba(178, 34, 34, 0.18)",
  },
  errorText: {
    flex: 1,
    color: "#8B1A1A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  modeChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E6E1",
  },
  modeChipActive: {
    backgroundColor: "#2C423F",
    borderColor: "#2C423F",
  },
  modeChipText: {
    color: "#5C5C59",
    fontSize: 13,
    fontWeight: "800",
  },
  modeChipTextActive: {
    color: "#FFFFFF",
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    gap: 14,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: "#F9F8F6",
    borderWidth: 1,
    borderColor: "#E8E6E1",
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: "#2C423F",
    fontSize: 15,
  },
  resultsList: {
    gap: 10,
  },
  emptyText: {
    color: "#5C5C59",
    textAlign: "center",
    paddingVertical: 12,
    fontSize: 13,
  },
  customerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#FFFFFF",
  },
  customerName: {
    color: "#2C423F",
    fontSize: 15,
    fontWeight: "800",
  },
  customerContractor: {
    color: "#5C5C59",
    marginTop: 3,
    fontSize: 12,
  },
  customerPin: {
    color: "#D95D39",
    fontWeight: "900",
    fontSize: 13,
  },
  pinInput: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#F9F8F6",
    color: "#2C423F",
    textAlign: "center",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 6,
  },
  primaryButton: {
    height: 50,
    borderRadius: 16,
    backgroundColor: "#D95D39",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonVisitor: {
    backgroundColor: "#DDF4D7",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  primaryButtonTextVisitor: {
    color: "#2C423F",
  },
  profileWrap: {
    gap: 12,
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: "#5C5C59",
    fontWeight: "800",
    fontSize: 13,
  },
  mealIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mealIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#FFFFFF",
  },
  mealIndicatorDotActiveGreen: {
    borderColor: "#16A34A",
    backgroundColor: "#22C55E",
  },
  mealIndicatorDotActiveRed: {
    borderColor: "#DC2626",
    backgroundColor: "#EF4444",
  },
  mealIndicatorOverflow: {
    marginLeft: 2,
    color: "#DC2626",
    fontSize: 10,
    fontWeight: "900",
  },
  cardEyebrow: {
    color: "#5C5C59",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "800",
  },
  profileName: {
    color: "#2C423F",
    fontSize: 24,
    fontWeight: "900",
  },
  profileContractor: {
    color: "#5C5C59",
    fontSize: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: "#2C423F",
    backgroundColor: "#2C423F",
  },
  filterChipText: {
    color: "#2C423F",
    fontSize: 12,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterInputsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  filterInput: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#FFFFFF",
    color: "#2C423F",
    paddingHorizontal: 10,
    fontSize: 13,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#F9F8F6",
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8E6E1",
  },
  statLabel: {
    color: "#5C5C59",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "800",
  },
  statValue: {
    color: "#2C423F",
    marginTop: 6,
    fontSize: 20,
    fontWeight: "900",
  },
  sectionTitle: {
    color: "#2C423F",
    fontSize: 18,
    fontWeight: "900",
  },
  foodRow: {
    flexDirection: "row",
    gap: 10,
  },
  foodChip: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#FFFFFF",
  },
  foodChipActive: {
    borderColor: "#D95D39",
    backgroundColor: "#F9F1EE",
  },
  foodChipText: {
    color: "#2C423F",
    fontWeight: "800",
    fontSize: 14,
  },
  foodChipTextActive: {
    color: "#D95D39",
  },
  foodTypeErrorText: {
    color: "#B22222",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  amountLabel: {
    color: "#5C5C59",
    fontSize: 12,
    fontWeight: "800",
  },
  amountInput: {
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    backgroundColor: "#FFFFFF",
    color: "#2C423F",
    paddingHorizontal: 14,
    fontSize: 16,
  },
  amountInputCustomer: {
    borderColor: "#D95D39",
  },
  historyList: {
    gap: 10,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEAE2",
    paddingBottom: 12,
  },
  historyMain: {
    flex: 1,
  },
  historyDate: {
    color: "#5C5C59",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  historyFood: {
    color: "#2C423F",
    marginTop: 4,
    fontSize: 14,
    fontWeight: "800",
  },
  historyAmount: {
    color: "#2C423F",
    fontSize: 14,
    fontWeight: "900",
  },
});
