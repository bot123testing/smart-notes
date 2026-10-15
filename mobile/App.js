import * as React from 'react';
import {
  useColorScheme, ActivityIndicator, View,
  Text, StyleSheet, Dimensions, Platform,
  TouchableOpacity
} from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring
} from 'react-native-reanimated';
import { Home, Share2, Search, Activity, Settings } from 'lucide-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, AuthContext } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { colors, typography, spacing } from './theme/theme';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import HomeScreen from './screens/HomeScreen';
import AddNoteScreen from './screens/AddNoteScreen';
import EditNoteScreen from './screens/EditNoteScreen';
import GraphScreen from './screens/GraphScreen';
import SearchScreen from './screens/SearchScreen';
import ActivityScreen from './screens/ActivityScreen';
import SettingsScreen from './screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Navigation ref so we can reset state on ready
const navigationRef = React.createRef();

const INDICATOR_WIDTH = 46;
const TAB_COUNT = 5;
const TAB_WIDTH = SCREEN_WIDTH / TAB_COUNT;

// Tab metadata
const TAB_META = {
  HomeTab: { Icon: Home, label: 'Notes' },
  SearchTab: { Icon: Search, label: 'Search' },
  ActivityTab: { Icon: Activity, label: 'Activity' },
  GraphTab: { Icon: Share2, label: 'Graph' },
  SettingsTab: { Icon: Settings, label: 'Settings' },
};

// ─── Single Tab Item ──────────────────────────────────────────────────────────
const TabItem = ({ route, isFocused, onPress, theme }) => {
  const iconScale = useSharedValue(isFocused ? 1.1 : 0.9);

  React.useEffect(() => {
    iconScale.value = withSpring(isFocused ? 1.1 : 0.9, { damping: 12, stiffness: 200 });
  }, [isFocused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const iconColor = isFocused ? theme.primary : theme.textTertiary;
  const { Icon, label } = TAB_META[route.name] ?? { Icon: Home, label: route.name };

  return (
    <TouchableOpacity
      key={route.key}
      onPress={onPress}
      style={styles.tabItem}
      activeOpacity={0.7}
    >
      <Animated.View style={[styles.tabPressable, iconStyle]}>
        <Icon
          size={22}
          color={iconColor}
          strokeWidth={isFocused ? 2.5 : 1.8}
        />
        <Text style={[styles.tabLabel, {
          color: iconColor,
          fontWeight: isFocused ? '700' : '400'
        }]}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Animated Custom Tab Bar ──────────────────────────────────────────────────
const AnimatedTabBar = ({ state, descriptors, navigation }) => {
  const { theme } = useTheme();
  const indicatorX = useSharedValue(state.index * TAB_WIDTH + (TAB_WIDTH - INDICATOR_WIDTH) / 2);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  React.useEffect(() => {
    indicatorX.value = withSpring(
      state.index * TAB_WIDTH + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
      { damping: 16, stiffness: 180 }
    );
  }, [state.index]);

  return (
    <View style={[styles.tabBar, {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
    }]}>
      <Animated.View style={[styles.indicator, { backgroundColor: theme.primaryLight }, indicatorStyle]} />
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        return (
          <TabItem
            key={route.key}
            route={route}
            isFocused={isFocused}
            onPress={onPress}
            theme={theme}
          />
        );
      })}
    </View>
  );
};

// ─── Home Stack (notes CRUD) ──────────────────────────────────────────────────
const HomeStack = () => {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'ios_from_right',
      }}
    >
      <Stack.Screen name="HomeScreen" component={HomeScreen} />
    </Stack.Navigator>
  );
};

// ─── Tab Navigator ────────────────────────────────────────────────────────────
const TabNavigator = () => {
  const { theme } = useTheme();
  return (
    <Tab.Navigator
      tabBar={props => <AnimatedTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen
        name="SearchTab"
        component={SearchScreen}
        options={{
          headerShown: true,
          headerTitle: 'Search Notes',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}
      />
      <Tab.Screen
        name="ActivityTab"
        component={ActivityScreen}
        options={{
          headerShown: true,
          headerTitle: 'Activity',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}
      />
      <Tab.Screen
        name="GraphTab"
        component={GraphScreen}
        options={{
          headerShown: true,
          headerTitle: 'Knowledge Graph',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          headerShown: true,
          headerTitle: 'Settings',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}
      />
    </Tab.Navigator>
  );
};

// ─── App Navigator (root stack wraps tabs + modal screens) ───────────────────
const AppNavigator = () => {
  const { userToken, isLoading } = React.useContext(AuthContext);
  const { theme, isDark } = useTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (userToken == null) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
      </Stack.Navigator>
    );
  }

  // Root stack: tabs + globally accessible EditNote/AddNote modals
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen
        name="EditNote"
        component={EditNoteScreen}
        options={{
          headerShown: true,
          headerTitle: 'Edit Note',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          animation: 'ios_from_right',
        }}
      />
      <Stack.Screen
        name="AddNote"
        component={AddNoteScreen}
        options={{
          headerShown: true,
          headerTitle: 'New Note',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack.Navigator>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const isDark = useColorScheme() === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ThemeProvider>
          <NavigationContainer
            ref={navigationRef}
            theme={isDark ? NavigationDarkTheme : DefaultTheme}
            onReady={() => {
              // Clear any stale persisted state so EditNote is never auto-restored
              navigationRef.current?.resetRoot({ index: 0, routes: [{ name: 'Main' }] });
            }}
          >
            <AppNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 80 : 60,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    position: 'relative',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: 8,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 36,
    borderRadius: 18,
    zIndex: 0,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPressable: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    zIndex: 10,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 0.2,
  },
});
