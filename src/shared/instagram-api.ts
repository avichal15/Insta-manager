import { AuthState, InstagramPost, InstagramReel, InstagramStory, InstagramUser } from './types';
import { IG_APP_ID, IG_BASE_URL, IG_DOC_IDS } from './constants';
import { AppStorage } from './storage';

export class InstagramAPI {
  private static async fetchIG(url: string, init?: RequestInit): Promise<Response> {
    const state = await AppStorage.getState();
    const headers = new Headers(init?.headers);

    headers.set('x-ig-app-id', IG_APP_ID);
    if (state.auth.csrfToken) {
      headers.set('x-csrftoken', state.auth.csrfToken);
    }
    
    headers.set('Accept', '*/*');
    headers.set('X-IG-WWW-Claim', '0');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const config: RequestInit = {
      ...init,
      headers,
      credentials: 'include',
    };

    const response = await fetch(url, config);

    if (response.status === 400 || response.status === 403 || response.status === 429) {
      const clone = response.clone();
      try {
        const errorData = await clone.json();
        if (errorData.message === 'challenge_required') {
          throw new Error('CHALLENGE_REQUIRED');
        }
        if (errorData.message === 'feedback_required') {
          throw new Error('FEEDBACK_REQUIRED');
        }
      } catch (e) {
        // Fallback for unparseable JSON error
      }
    }

    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  private static async graphqlQuery(docId: string, variables: Record<string, any>): Promise<any> {
    const url = new URL('/api/graphql', IG_BASE_URL);
    
    const formData = new URLSearchParams();
    formData.append('doc_id', docId);
    formData.append('variables', JSON.stringify(variables));

    const response = await this.fetchIG(url.toString(), {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.json();
  }

  static async extractAuth(): Promise<AuthState> {
    let csrfToken = null;
    let appId = IG_APP_ID;
    let dtsgToken = null;
    let isLoggedIn = false;
    let userId = null;

    const cookieMatch = document.cookie.match(/csrftoken=([^;]+)/);
    if (cookieMatch) {
      csrfToken = cookieMatch[1];
    }

    const dsUserIdMatch = document.cookie.match(/ds_user_id=([^;]+)/);
    if (dsUserIdMatch) {
      userId = dsUserIdMatch[1];
      isLoggedIn = true;
    }

    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const content = scripts[i].innerHTML;
      if (content.includes('DTSGInitialData')) {
        const dtsgMatch = content.match(/"token":"([^"]+)"/);
        if (dtsgMatch) {
          dtsgToken = dtsgMatch[1];
        }
      }
    }

    return {
      isLoggedIn,
      userId,
      username: null,
      avatarUrl: null,
      csrfToken,
      appId,
      dtsgToken,
    };
  }

  static async getProfile(username: string): Promise<InstagramUser> {
    const url = `${IG_BASE_URL}/api/v1/users/web_profile_info/?username=${username}`;
    const response = await this.fetchIG(url);
    const data = await response.json();
    
    const user = data.data?.user;
    if (!user) throw new Error('User not found');

    return {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      avatarUrl: user.profile_pic_url_hd || user.profile_pic_url,
      isPrivate: user.is_private,
      isVerified: user.is_verified,
      isFollowing: user.viewer_has_followed,
      followerCount: user.edge_followed_by?.count || 0,
      followingCount: user.edge_follow?.count || 0,
      postCount: user.edge_owner_to_timeline_media?.count || 0,
      bio: user.biography,
      category: user.category_name,
      isBusiness: user.is_business_account,
      isProfessional: user.is_professional_account,
    };
  }

  static async getProfileById(userId: string): Promise<InstagramUser> {
    const data = await this.graphqlQuery(IG_DOC_IDS.PROFILE, { id: userId, render_surface: 'PROFILE' });
    const user = data.data?.user;
    if (!user) throw new Error('User not found');

    return {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      avatarUrl: user.profile_pic_url_hd || user.profile_pic_url,
      isPrivate: user.is_private,
      isVerified: user.is_verified,
      isFollowing: user.viewer_has_followed,
      followerCount: user.edge_followed_by?.count || 0,
      followingCount: user.edge_follow?.count || 0,
      postCount: user.edge_owner_to_timeline_media?.count || 0,
      bio: user.biography,
      category: user.category_name,
      isBusiness: user.is_business_account,
      isProfessional: user.is_professional_account,
    };
  }

  static async getUserPosts(username: string, count: number = 12, cursor?: string) {
    const user = await this.getProfile(username);
    const variables = { id: user.id, first: count, after: cursor };
    const data = await this.graphqlQuery(IG_DOC_IDS.POSTS, variables);
    
    const edges = data.data?.user?.edge_owner_to_timeline_media?.edges || [];
    const pageInfo = data.data?.user?.edge_owner_to_timeline_media?.page_info;

    const posts: InstagramPost[] = edges.map((edge: any) => {
      const node = edge.node;
      const type = node.is_video ? 'video' : (node.edge_sidecar_to_children ? 'carousel' : 'photo');
      return {
        id: node.id,
        code: node.shortcode,
        type,
        caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
        takenAt: node.taken_at_timestamp,
        likes: node.edge_media_preview_like?.count || 0,
        comments: node.edge_media_to_comment?.count || 0,
        views: node.video_view_count,
        imageVersions: [{ url: node.display_url, width: node.dimensions?.width, height: node.dimensions?.height }],
        videoVersions: node.is_video ? [{ url: node.video_url, width: node.dimensions?.width, height: node.dimensions?.height }] : [],
        isLiked: node.viewer_has_liked,
      };
    });

    return { posts, pageInfo };
  }

  static async getUserReels(userId: string, count: number = 12, cursor?: string) {
    const variables = { target_user_id: userId, page_size: count, max_id: cursor };
    const data = await this.graphqlQuery(IG_DOC_IDS.REELS, variables);
    
    const items = data.data?.user?.edge_felix_video_timeline?.edges || [];
    const pageInfo = data.data?.user?.edge_felix_video_timeline?.page_info;

    const reels: InstagramReel[] = items.map((edge: any) => {
      const node = edge.node;
      return {
        id: node.id,
        code: node.shortcode,
        likes: node.edge_media_preview_like?.count || 0,
        comments: node.edge_media_to_comment?.count || 0,
        views: node.video_view_count || 0,
        imageVersions: [{ url: node.display_url, width: node.dimensions?.width, height: node.dimensions?.height }],
        videoVersions: node.video_url ? [{ url: node.video_url, width: node.dimensions?.width, height: node.dimensions?.height }] : [],
      };
    });

    return { reels, pageInfo };
  }

  static async getUserStories(userId: string) {
    const variables = { reel_ids: [userId], prefetch_reel: false };
    const data = await this.graphqlQuery(IG_DOC_IDS.STORIES, variables);
    
    const items = data.data?.reels_media?.[0]?.items || [];

    const stories: InstagramStory[] = items.map((item: any) => {
      return {
        id: item.id,
        code: item.shortcode || item.id,
        takenAt: item.taken_at_timestamp,
        imageVersions: [{ url: item.display_url, width: item.dimensions?.width, height: item.dimensions?.height }],
        videoVersions: item.is_video ? [{ url: item.video_resources?.[0]?.src || item.video_url, width: item.dimensions?.width, height: item.dimensions?.height }] : [],
        expiringAt: item.expiring_at_timestamp,
      };
    });

    return stories;
  }

  static async getPostByCode(code: string): Promise<InstagramPost> {
    const variables = { shortcode: code, child_comment_count: 3, fetch_comment_count: 40, parent_comment_count: 24, has_threaded_comments: true };
    const data = await this.graphqlQuery(IG_DOC_IDS.POST_BY_SHORTCODE, variables);
    
    const node = data.data?.shortcode_media;
    if (!node) throw new Error('Post not found');

    const type = node.is_video ? 'video' : (node.edge_sidecar_to_children ? 'carousel' : 'photo');
    return {
      id: node.id,
      code: node.shortcode,
      type,
      caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
      takenAt: node.taken_at_timestamp,
      likes: node.edge_media_preview_like?.count || 0,
      comments: node.edge_media_to_parent_comment?.count || 0,
      views: node.video_view_count,
      imageVersions: [{ url: node.display_url, width: node.dimensions?.width, height: node.dimensions?.height }],
      videoVersions: node.is_video ? [{ url: node.video_url, width: node.dimensions?.width, height: node.dimensions?.height }] : [],
      isLiked: node.viewer_has_liked,
    };
  }

  static async likePost(mediaId: string) {
    const variables = { media_id: mediaId };
    const data = await this.graphqlQuery(IG_DOC_IDS.LIKE, variables);
    return data;
  }

  static async followUser(userId: string) {
    const url = `${IG_BASE_URL}/web/friendships/${userId}/follow/`;
    const response = await this.fetchIG(url, { method: 'POST' });
    return response.json();
  }

  static async unfollowUser(userId: string) {
    const url = `${IG_BASE_URL}/web/friendships/${userId}/unfollow/`;
    const response = await this.fetchIG(url, { method: 'POST' });
    return response.json();
  }

  static async getFollowers(userId: string, count: number = 24, cursor?: string) {
    const variables = { id: userId, include_reel: true, fetch_mutual: false, first: count, after: cursor };
    const data = await this.graphqlQuery(IG_DOC_IDS.FOLLOWERS, variables);
    
    const edges = data.data?.user?.edge_followed_by?.edges || [];
    const pageInfo = data.data?.user?.edge_followed_by?.page_info;

    return { followers: edges.map((e: any) => e.node), pageInfo };
  }

  static async getFollowing(userId: string, count: number = 24, cursor?: string) {
    const variables = { id: userId, includes_reel: true, fetch_mutual: false, first: count, after: cursor };
    const data = await this.graphqlQuery(IG_DOC_IDS.FOLLOWING, variables);
    
    const edges = data.data?.user?.edge_follow?.edges || [];
    const pageInfo = data.data?.user?.edge_follow?.page_info;

    return { following: edges.map((e: any) => e.node), pageInfo };
  }

  static async searchProfiles(query: string) {
    const url = `${IG_BASE_URL}/web/search/topsearch/?context=blended&query=${encodeURIComponent(query)}&rank_token=0.1`;
    const response = await this.fetchIG(url);
    const data = await response.json();
    return data.users.map((u: any) => u.user);
  }
}
