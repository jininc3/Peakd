import { Tabs } from 'expo-router';
import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        lazy: true,
        freezeOnBlur: true,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#555',
        tabBarStyle: {
          backgroundColor: '#0f0f0f',
          height: 82,
          paddingBottom: 20,
          paddingTop: 6,
          borderTopWidth: 0,
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#0f0f0f' }} />
            <LinearGradient
              colors={[
                'transparent',
                'rgba(212, 184, 120, 0.03)',
                'rgba(212, 184, 120, 0.06)',
                'rgba(212, 184, 120, 0.03)',
                'transparent',
              ]}
              locations={[0, 0.37, 0.5, 0.63, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={[
                'transparent',
                'rgba(212, 184, 120, 0.035)',
                'transparent',
              ]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ),
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/home.png')}
              style={{ width: 55, height: 55, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/search.png')}
              style={{ width: 42, height: 42, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboards"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="list.number" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="duoFinder"
        options={{
          title: 'LFG',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/duofinder.png')}
              style={{ width: 48, height: 48, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/profile.png')}
              style={{ width: 42, height: 42, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
    </Tabs>
  );
}
