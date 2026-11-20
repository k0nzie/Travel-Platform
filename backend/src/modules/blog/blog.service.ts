import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { AccountStatus, Role } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { escapeRegex, toPage } from '../../common/utils/paginate';
import { ItinerariesService } from '../itineraries/itineraries.service';
import { MediaService } from '../media/media.service';
import { MediaOwnerType } from '../media/schemas/media.schema';
import { publicAuthor, UsersService } from '../users/users.service';
import { CreatePostDto, UpdatePostDto } from './dto/post.dto';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Like, LikeDocument } from './schemas/like.schema';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';

const EXCERPT_LENGTH = 200;

/** Lookups that add likeCount / commentCount (visible comments only) and the author's name. */
const engagementStages: PipelineStage[] = [
  {
    $lookup: {
      from: 'likes',
      let: { p: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: ['$post', '$$p'] } } }, { $count: 'n' }],
      as: '_likes',
    },
  },
  {
    $lookup: {
      from: 'comments',
      let: { p: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: ['$post', '$$p'] }, hidden: { $ne: true } } }, { $count: 'n' }],
      as: '_comments',
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'author',
      foreignField: '_id',
      pipeline: [{ $project: { name: 1, status: 1 } }],
      as: '_author',
    },
  },
  {
    $addFields: {
      likeCount: { $ifNull: [{ $arrayElemAt: ['$_likes.n', 0] }, 0] },
      commentCount: { $ifNull: [{ $arrayElemAt: ['$_comments.n', 0] }, 0] },
      _author: { $arrayElemAt: ['$_author', 0] },
    },
  },
  { $addFields: { interactionScore: { $add: ['$likeCount', '$commentCount'] } } },
];

type PostRow = Post & {
  _id: Types.ObjectId;
  likeCount: number;
  commentCount: number;
  interactionScore: number;
  _author?: { _id: Types.ObjectId; name: string; status: AccountStatus };
};

/** List item: title, author, date, excerpt, tags and engagement (BLG-02, BLG-03, BLG-09). */
const summary = (p: PostRow) => ({
  id: String(p._id),
  title: p.title,
  excerpt: p.content.length > EXCERPT_LENGTH ? `${p.content.slice(0, EXCERPT_LENGTH).trimEnd()}…` : p.content,
  tags: p.tags,
  status: p.status,
  hidden: !!p.hidden,
  author: publicAuthor(p._author),
  publishedAt: p.publishedAt ?? null,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  likeCount: p.likeCount,
  commentCount: p.commentCount,
});

const normaliseTags = (tags?: string[]) => [
  ...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
];

/**
 * BLG-01 to BLG-12. The blog module owns posts, comments and likes. Content of deactivated
 * accounts is hidden (ACC-12) and admin-hidden content is shown only to its author and admins (GEN-10).
 */
@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    @InjectModel(Comment.name) private readonly comments: Model<CommentDocument>,
    @InjectModel(Like.name) private readonly likes: Model<LikeDocument>,
    private readonly media: MediaService,
    private readonly users: UsersService,
    private readonly itineraries: ItinerariesService,
  ) {}

  private oid(value: string, label: string) {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`Invalid ${label}`);
    return new Types.ObjectId(value);
  }

  /** Published, not hidden, author not deactivated: what guests may see. */
  private async visibleFilter(): Promise<Record<string, any>> {
    return {
      status: PostStatus.Published,
      hidden: { $ne: true },
      author: { $nin: await this.users.getDeactivatedUserIds() },
    };
  }

  private async page(match: Record<string, any>, sort: Record<string, 1 | -1>, page = 1, limit = 10) {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const [result] = await this.posts
      .aggregate<{
        items: PostRow[];
        total: { n: number }[];
      }>([{ $match: match }, ...engagementStages, { $sort: sort }, { $facet: { items: [{ $skip: (p - 1) * l }, { $limit: l }], total: [{ $count: 'n' }] } }])
      .exec();
    return toPage(result.items.map(summary), result.total[0]?.n ?? 0, p, l);
  }

  // ---------- posts ----------

  /** BLG-01 */
  async create(userId: string, dto: CreatePostDto) {
    const status = dto.status ?? PostStatus.Draft;
    const post = await this.posts.create({
      ...dto,
      tags: normaliseTags(dto.tags),
      author: this.oid(userId, 'user ID'),
      status,
      publishedAt: status === PostStatus.Published ? new Date() : null,
    });
    return this.getPost(String(post._id), { id: userId } as AuthUser);
  }

  /** BLG-02 / BLG-08: published posts, newest first, optionally by tag. */
  async listPublished(page = 1, limit = 10, tag?: string) {
    const match = await this.visibleFilter();
    if (tag?.trim()) match.tags = tag.trim().toLowerCase();
    return this.page(match, { publishedAt: -1, _id: -1 }, page, limit);
  }

  /** BLG-03: my posts including drafts (and posts an admin hid), with like and comment counts. */
  listMine(userId: string, page = 1, limit = 10) {
    return this.page({ author: this.oid(userId, 'user ID') }, { updatedAt: -1, _id: -1 }, page, limit);
  }

  /**
   * BLG-09: keyword in title, tags or author name; ordered by interaction score
   * (likes + comments) descending, newest first as the tie-breaker. Empty keyword lists all.
   */
  async search(keyword: string | undefined, page = 1, limit = 10) {
    const match = await this.visibleFilter();
    const q = keyword?.trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      match.$or = [{ title: rx }, { tags: rx }, { author: { $in: await this.users.findIdsByName(rx) } }];
    }
    return this.page(match, { interactionScore: -1, publishedAt: -1, _id: -1 }, page, limit);
  }

  /** BLG-08 */
  postsByTag(tag: string, page = 1, limit = 10) {
    return this.listPublished(page, limit, tag);
  }

  /**
   * BLG-02: the post page. Drafts and hidden posts are visible only to the author (and admins);
   * posts of deactivated authors are hidden from everyone else (ACC-12).
   */
  async getPost(postId: string, viewer?: AuthUser) {
    const id = this.oid(postId, 'post ID');
    const [row] = await this.posts.aggregate<PostRow>([{ $match: { _id: id } }, ...engagementStages]).exec();
    if (!row) throw new NotFoundException('Post not found');
    const isAuthor = !!viewer && String(row.author) === viewer.id;
    const isAdmin = viewer?.role === Role.Admin;
    const publiclyVisible =
      row.status === PostStatus.Published && !row.hidden && row._author?.status !== AccountStatus.Deactivated;
    if (!publiclyVisible && !isAuthor && !isAdmin) throw new NotFoundException('Post not found');

    const [images, likedByMe] = await Promise.all([
      this.media.list(MediaOwnerType.Post, id),
      viewer ? this.likes.exists({ post: id, user: this.oid(viewer.id, 'user ID') }) : null,
    ]);
    return { ...summary(row), content: row.content, images, likedByMe: !!likedByMe };
  }

  /** BLG-04 */
  async update(userId: string, postId: string, dto: UpdatePostDto) {
    const existing = await this.posts
      .findOne({ _id: this.oid(postId, 'post ID'), author: this.oid(userId, 'user ID') })
      .exec();
    if (!existing) throw new NotFoundException('Post not found or not owned by you');
    const update: Record<string, any> = { ...dto };
    if (dto.tags) update.tags = normaliseTags(dto.tags);
    if (dto.status === PostStatus.Published && existing.status !== PostStatus.Published)
      update.publishedAt = new Date();
    if (dto.status === PostStatus.Draft) update.publishedAt = null;
    await this.posts.updateOne({ _id: existing._id }, { $set: update }, { runValidators: true }).exec();
    return this.getPost(postId, { id: userId } as AuthUser);
  }

  /** BLG-04 */
  async delete(userId: string, postId: string) {
    const post = await this.posts
      .findOneAndDelete({ _id: this.oid(postId, 'post ID'), author: this.oid(userId, 'user ID') })
      .exec();
    if (!post) throw new NotFoundException('Post not found or not owned by you');
    await this.cascade(post._id);
    return { deleted: true };
  }

  private async cascade(postId: Types.ObjectId) {
    await Promise.all([
      this.media.removeAllFor(MediaOwnerType.Post, postId),
      this.comments.deleteMany({ post: postId }).exec(),
      this.likes.deleteMany({ post: postId }).exec(),
    ]);
  }

  /** BLG-12: name, join date, published posts and public itineraries. */
  async authorPage(authorId: string, page = 1, limit = 10) {
    const author = await this.users.findById(authorId);
    if (!author || author.status === AccountStatus.Deactivated) throw new NotFoundException('Author not found');
    const [posts, publicItineraries] = await Promise.all([
      this.page(
        { author: author._id, status: PostStatus.Published, hidden: { $ne: true } },
        { publishedAt: -1, _id: -1 },
        page,
        limit,
      ),
      this.itineraries.listPublicByOwner(String(author._id), 1, 10),
    ]);
    return {
      author: { id: String(author._id), name: author.name, joinedAt: author.createdAt },
      posts,
      publicItineraries,
    };
  }

  // ---------- comments (BLG-05, BLG-07) ----------

  private async visiblePost(postId: string) {
    const post = await this.posts
      .findOne({ _id: this.oid(postId, 'post ID'), ...(await this.visibleFilter()) })
      .select('_id')
      .lean()
      .exec();
    if (!post) throw new NotFoundException('Post not found');
    return post._id as Types.ObjectId;
  }

  async addComment(userId: string, postId: string, content: string) {
    const post = await this.visiblePost(postId);
    const comment = await this.comments.create({ post, author: this.oid(userId, 'user ID'), content: content.trim() });
    return this.commentView(await comment.populate('author', 'name status'));
  }

  /** BLG-05: chronological order (oldest first), paginated; deactivated authors show as "Deleted user". */
  async listComments(postId: string, page = 1, limit = 10) {
    const post = await this.visiblePost(postId);
    const filter = { post, hidden: { $ne: true } };
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const [items, total] = await Promise.all([
      this.comments
        .find(filter)
        .populate('author', 'name status')
        .sort({ createdAt: 1, _id: 1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean()
        .exec(),
      this.comments.countDocuments(filter).exec(),
    ]);
    return toPage(
      items.map((c) => this.commentView(c)),
      total,
      p,
      l,
    );
  }

  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await this.comments
      .findOneAndUpdate(
        { _id: this.oid(commentId, 'comment ID'), author: this.oid(userId, 'user ID') },
        { $set: { content: content.trim() } },
        { new: true, runValidators: true },
      )
      .populate('author', 'name status')
      .exec();
    if (!comment) throw new NotFoundException('Comment not found or not owned by you');
    return this.commentView(comment);
  }

  async deleteComment(userId: string, commentId: string) {
    const result = await this.comments
      .findOneAndDelete({ _id: this.oid(commentId, 'comment ID'), author: this.oid(userId, 'user ID') })
      .exec();
    if (!result) throw new NotFoundException('Comment not found or not owned by you');
    return { deleted: true };
  }

  private commentView(c: any) {
    return {
      id: String(c._id),
      postId: String(c.post),
      content: c.content,
      author: publicAuthor(c.author),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  // ---------- likes (BLG-06) ----------

  /** Like once: repeating the request keeps a single like. */
  async like(userId: string, postId: string) {
    const post = await this.visiblePost(postId);
    try {
      await this.likes.create({ post, user: this.oid(userId, 'user ID') });
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
    return { postId, liked: true, likeCount: await this.likes.countDocuments({ post }).exec() };
  }

  async unlike(userId: string, postId: string) {
    const post = await this.visiblePost(postId);
    await this.likes.deleteOne({ post, user: this.oid(userId, 'user ID') }).exec();
    return { postId, liked: false, likeCount: await this.likes.countDocuments({ post }).exec() };
  }

  async likeCount(postId: string) {
    const post = await this.visiblePost(postId);
    return { postId, likeCount: await this.likes.countDocuments({ post }).exec() };
  }

  // ---------- images (BLG-10 / GEN-08) ----------

  private async ownPost(userId: string, postId: string) {
    const post = await this.posts
      .findOne({ _id: this.oid(postId, 'post ID'), author: this.oid(userId, 'user ID') })
      .select('_id')
      .lean()
      .exec();
    if (!post) throw new NotFoundException('Post not found or not owned by you');
    return post._id as Types.ObjectId;
  }

  async uploadImages(userId: string, postId: string, files: Express.Multer.File[]) {
    const post = await this.ownPost(userId, postId);
    return this.media.saveImages({ files, ownerType: MediaOwnerType.Post, ownerId: post, uploadedBy: userId });
  }

  async listImages(postId: string) {
    return this.media.list(MediaOwnerType.Post, await this.visiblePost(postId));
  }

  async deleteImage(userId: string, postId: string, imageId: string) {
    return this.media.remove(MediaOwnerType.Post, await this.ownPost(userId, postId), imageId);
  }

  // ---------- moderation (GEN-09 / GEN-10, called by the admin module) ----------

  /** GEN-09: can this post / comment be reported (it exists and others can see it)? */
  async isReportable(type: 'post' | 'comment', id: string) {
    if (type === 'post') {
      return !!(await this.posts.exists({ _id: this.oid(id, 'post ID'), ...(await this.visibleFilter()) }));
    }
    return !!(await this.comments.exists({ _id: this.oid(id, 'comment ID'), hidden: { $ne: true } }));
  }

  /** GEN-10: hide / unhide. Returns false when the content does not exist. */
  async setHiddenForModeration(type: 'post' | 'comment', id: string, hidden: boolean) {
    const model = (type === 'post' ? this.posts : this.comments) as Model<any>;
    const res = await model.updateOne({ _id: this.oid(id, `${type} ID`) }, { $set: { hidden } }).exec();
    return res.matchedCount === 1;
  }

  /** GEN-10: delete any post (with its comments, likes and images) or comment. */
  async deleteForModeration(type: 'post' | 'comment', id: string) {
    const oid = this.oid(id, `${type} ID`);
    if (type === 'comment') return (await this.comments.deleteOne({ _id: oid }).exec()).deletedCount === 1;
    const post = await this.posts.findOneAndDelete({ _id: oid }).exec();
    if (!post) return false;
    await this.cascade(post._id);
    return true;
  }

  /** Kept for existing callers. */
  async deleteContentForModeration(postId: string) {
    await this.deleteForModeration('post', postId);
    return { deleted: true };
  }
}
