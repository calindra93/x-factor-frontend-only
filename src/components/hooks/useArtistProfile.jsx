import { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";

// Singleton profile cache
let profileCache = null;
let profileSubscription = null;
let subscriberCount = 0;

/**
 * Hook to fetch and subscribe to artist profile.
 * Only one subscription active at a time; cached across all components.
 * 
 * Returns: { profile, loading, error }
 */
export function useArtistProfile(userAccountId) {
  const [profile, setProfile] = useState(profileCache);
  const [loading, setLoading] = useState(!profileCache && !!userAccountId);
  const [error, setError] = useState(null);
  const isActiveRef = useRef(true);

  useEffect(() => {
    if (!userAccountId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    isActiveRef.current = true;
    let isMounted = true;

    const fetchProfile = async () => {
      try {
        // Use cache if available and matches this user
        if (profileCache && profileCache.user_account_id === userAccountId) {
          setProfile(profileCache);
          setLoading(false);
          setError(null);
          subscriberCount++;
          setupSubscription();
          return;
        }

        const profiles = await base44.entities.ArtistProfile.filter({
          user_account_id: userAccountId
        });

        if (!isActiveRef.current) return;

        if (!profiles || profiles.length === 0) {
          setProfile(null);
          setLoading(false);
          setError(null);
          return;
        }

        profileCache = profiles[0];
        if (isMounted) {
          setProfile(profileCache);
          setLoading(false);
          setError(null);
          subscriberCount++;
          setupSubscription();
        }
      } catch (err) {
        if (isActiveRef.current && isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isActiveRef.current = false;
      isMounted = false;
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0 && profileSubscription) {
        profileSubscription();
        profileSubscription = null;
      }
    };
  }, [userAccountId]);

  return { profile, loading, error };
}

function setupSubscription() {
  if (profileSubscription) return; // Already subscribed

  profileSubscription = base44.entities.ArtistProfile.subscribe((event) => {
    // Update cache on any change to this profile
    if (profileCache && event.id === profileCache.id) {
      profileCache = event.data;
      // Note: components subscribed to this hook will re-render via React subscription
    }
  });
}