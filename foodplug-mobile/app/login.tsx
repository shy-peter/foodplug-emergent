import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

const demoCredentials = [
  { label: "Admin demo", email: "admin@foodplug.com", password: "admin123" },
  { label: "Sales demo", email: "sales@foodplug.com", password: "sales123" },
];

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hydrated, user, login, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length > 0 && !loading,
    [email, loading, password],
  );

  if (hydrated && user) {
    return <Redirect href={user.role === "admin" ? "/(tabs)" : "/sales"} />;
  }

  const handleLogin = async () => {
    setError("");

    try {
      const nextUser = await login(email.trim(), password);
      router.replace(nextUser.role === "admin" ? "/(tabs)" : "/sales");
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Login failed. Please try again.";
      setError(message);
    }
  };

  const fillDemoCredentials = (nextEmail: string, nextPassword: string) => {
    setEmail(nextEmail);
    setPassword(nextPassword);
    setError("");
  };

  if (!hydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D95D39" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? Math.max(insets.top, 8) : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.backgroundBlobOne} />
        <View style={styles.backgroundBlobTwo} />

        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Ionicons name="restaurant-outline" size={24} color="#FFF7ED" />
          </View>
          <Text style={styles.brandText}>FoodPlug</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Welcome back</Text>
          <Text style={styles.title}>Sign in to your account</Text>
          <Text style={styles.subtitle}>
            Admins get full analytics. Sales reps get the on-site POS.
          </Text>

          <View style={styles.statRow}>
            <Stat label="Sites" value="24" />
            <Stat label="Workers" value="1.2k" />
            <Stat label="Meals / day" value="4,800" />
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formLabel}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="admin@foodplug.com"
            placeholderTextColor="#8A8A86"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={styles.input}
          />

          <Text style={[styles.formLabel, styles.formLabelSpacing]}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#8A8A86"
            secureTextEntry
            textContentType="password"
            style={styles.input}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            onPress={handleLogin}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitButton,
              (!canSubmit || pressed) && styles.submitButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Sign in</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9F8F6",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9F8F6",
  },
  backgroundBlobOne: {
    position: "absolute",
    top: 32,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: "rgba(217, 93, 57, 0.12)",
  },
  backgroundBlobTwo: {
    position: "absolute",
    bottom: 40,
    left: -48,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "rgba(44, 66, 63, 0.08)",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D95D39",
  },
  brandText: {
    color: "#2C423F",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  heroCard: {
    backgroundColor: "#2C423F",
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 6,
  },
  eyebrow: {
    color: "#D4A373",
    textTransform: "uppercase",
    letterSpacing: 3,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    color: "#FFFFFF",
    marginTop: 10,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "rgba(255, 244, 229, 0.82)",
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },
  statItem: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: "#D95D39",
    paddingLeft: 10,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  statLabel: {
    color: "rgba(212, 163, 115, 0.88)",
    marginTop: 4,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E8E6E1",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  formLabel: {
    color: "#2C423F",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  formLabelSpacing: {
    marginTop: 14,
  },
  input: {
    height: 52,
    backgroundColor: "#FAFAF8",
    borderWidth: 1,
    borderColor: "#E8E6E1",
    borderRadius: 16,
    paddingHorizontal: 16,
    color: "#2C423F",
    fontSize: 15,
  },
  errorText: {
    color: "#B22222",
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  submitButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#D95D39",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.8,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  demoSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#ECE8E0",
  },
  demoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  demoTitle: {
    color: "#2C423F",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  demoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  demoPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F5F2EC",
    borderWidth: 1,
    borderColor: "#E8E6E1",
  },
  demoPillPressed: {
    backgroundColor: "#ECE3DA",
  },
  demoPillText: {
    color: "#2C423F",
    fontSize: 13,
    fontWeight: "700",
  },
  demoCopy: {
    marginTop: 10,
    color: "#5C5C59",
    fontSize: 12,
    lineHeight: 18,
  },
});
