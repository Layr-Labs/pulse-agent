import { NextRequest, NextResponse } from 'next/server';

interface TwitterUserResponse {
  status: string;
  msg: string;
  data: {
    id: string;
    name: string;
    userName: string;
    location?: string;
    url?: string;
    description?: string;
    protected: boolean;
    isVerified: boolean;
    isBlueVerified: boolean;
    verifiedType?: string;
    followers: number;
    following: number;
    favouritesCount: number;
    statusesCount: number;
    mediaCount: number;
    createdAt: string;
    coverPicture?: string;
    profilePicture: string;
    canDm: boolean;
    isAutomated: boolean;
    automatedBy?: string;
    pinnedTweetIds?: string[];
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username parameter is required' },
        { status: 400 }
      );
    }

    const twitterApiKey = process.env.TWITTER_API_KEY;
    if (!twitterApiKey) {
      console.error('TWITTER_API_KEY not found in environment variables');
      return NextResponse.json(
        { error: 'Twitter API key not configured' },
        { status: 500 }
      );
    }

    console.log(`🐦 [TWITTER_API] Fetching user info for: ${username}`);

    const response = await fetch(
      `https://api.twitterapi.io/twitter/user/info?userName=${username}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': twitterApiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`🐦 [TWITTER_API] API Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`🐦 [TWITTER_API] Error details:`, errorText);

      return NextResponse.json(
        {
          error: `Twitter API error: ${response.status}`,
          username,
          fallback: true
        },
        { status: response.status }
      );
    }

    const data: TwitterUserResponse = await response.json();

    // Check if the API returned success
    if (data.status !== 'success') {
      console.error(`🐦 [TWITTER_API] API returned error status: ${data.status} - ${data.msg}`);
      return NextResponse.json(
        {
          error: `Twitter API error: ${data.msg}`,
          username,
          fallback: true
        },
        { status: 400 }
      );
    }

    console.log(`🐦 [TWITTER_API] Successfully fetched data for ${username}:`, {
      name: data.data.name,
      followers: data.data.followers,
      verified: data.data.isVerified || data.data.isBlueVerified
    });

    // Transform the data to our format
    const userProfile = {
      username: data.data.userName,
      displayName: data.data.name,
      profileImageUrl: data.data.profilePicture?.replace('_normal', '_400x400') || '', // Get higher res image
      verified: data.data.isVerified || data.data.isBlueVerified, // Either legacy verified or blue verified
      followerCount: data.data.followers || 0,
      followingCount: data.data.following || 0,
      tweetCount: data.data.statusesCount || 0,
      favouritesCount: data.data.favouritesCount || 0,
      mediaCount: data.data.mediaCount || 0,
      description: data.data.description || '',
      location: data.data.location || '',
      url: data.data.url || '',
      coverPicture: data.data.coverPicture || '',
      createdAt: data.data.createdAt,
      protected: data.data.protected,
      canDm: data.data.canDm,
      isAutomated: data.data.isAutomated,
      isOnline: true // We'll assume they're online if we can fetch their data
    };

    return NextResponse.json({ data: userProfile });

  } catch (error) {
    console.error('🐦 [TWITTER_API] Error fetching Twitter user info:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: `Failed to fetch Twitter user info: ${errorMessage}`,
        fallback: true
      },
      { status: 500 }
    );
  }
}