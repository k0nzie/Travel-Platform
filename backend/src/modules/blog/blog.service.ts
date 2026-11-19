import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MediaService } from '../media/media.service';
import { MediaOwnerType } from '../media/schemas/media.schema';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Like, LikeDocument } from './schemas/like.schema';
import { CreatePostDto, UpdatePostDto } from './dto/post.dto';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    @InjectModel(Comment.name) private readonly comments: Model<CommentDocument>,
    @InjectModel(Like.name) private readonly likes: Model<LikeDocument>,
    private readonly media: MediaService,
  ) {}

  private id(value: string, label: string) {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`Invalid ${label}`);
    return new Types.ObjectId(value);
  }

  async create(userId: string, dto: CreatePostDto) {
    const status = dto.status ?? PostStatus.Draft;
    const tags = [...new Set((dto.tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean))];
    return this.posts.create({ ...dto, tags, author: this.id(userId, 'user ID'), status,
      publishedAt: status === PostStatus.Published ? new Date() : null });
  }

  async listPublished(page = 1, limit = 10, tag?: string) {
    const p = Math.max(1, Number(page) || 1), l = Math.min(50, Math.max(1, Number(limit) || 10));
    const filter: Record<string, any> = { status: PostStatus.Published };
    if (tag) filter.tags = tag.trim().toLowerCase();
    const [posts, total] = await Promise.all([
      this.posts.find(filter).populate('author', 'name').sort({ publishedAt: -1 }).skip((p - 1) * l).limit(l).lean().exec(),
      this.posts.countDocuments(filter),
    ]);
    return { posts, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  async listMine(userId: string) {
    return this.posts.find({ author: this.id(userId, 'user ID') }).sort({ updatedAt: -1 }).lean().exec();
  }

  async getPost(postId: string): Promise<any> {
    const post = await this.posts.findOne({ _id: this.id(postId, 'post ID'), status: PostStatus.Published })
      .populate('author', 'name').lean().exec();
    if (!post) throw new NotFoundException('Post not found');
    const [images, likes, comments] = await Promise.all([
      this.media.list(MediaOwnerType.Post, post._id), this.likes.countDocuments({ post: post._id }),
      this.comments.countDocuments({ post: post._id }),
    ]);
    return { ...post, images, likeCount: likes, commentCount: comments };
  }

  async update(userId: string, postId: string, dto: UpdatePostDto) {
    const update: Record<string, any> = { ...dto };
    if (dto.tags) update.tags = [...new Set(dto.tags.map(t => t.trim().toLowerCase()).filter(Boolean))];
    if (dto.status === PostStatus.Published) update.publishedAt = new Date();
    if (dto.status === PostStatus.Draft) update.publishedAt = null;
    const post = await this.posts.findOneAndUpdate(
      { _id: this.id(postId, 'post ID'), author: this.id(userId, 'user ID') },
      { $set: update }, { new: true, runValidators: true }).exec();
    if (!post) throw new NotFoundException('Post not found or not owned by you');
    return post;
  }

  async delete(userId: string, postId: string) {
    const post = await this.posts.findOneAndDelete({ _id: this.id(postId, 'post ID'), author: this.id(userId, 'user ID') }).exec();
    if (!post) throw new NotFoundException('Post not found or not owned by you');
    await Promise.all([
      this.media.removeAllFor(MediaOwnerType.Post, post._id),
      this.comments.deleteMany({ post: post._id }).exec(),
      this.likes.deleteMany({ post: post._id }).exec(),
    ]);
    return { deleted: true };
  }

  async search(keyword: string, page = 1, limit = 10) {
    if (!keyword?.trim()) return this.listPublished(page, limit);
    const p = Math.max(1, Number(page) || 1), l = Math.min(50, Math.max(1, Number(limit) || 10));
    const filter = { status: PostStatus.Published, $text: { $search: keyword.trim() } };
    const [posts, total] = await Promise.all([
      this.posts.find(filter, { score: { $meta: 'textScore' } }).populate('author', 'name')
        .sort({ score: { $meta: 'textScore' }, publishedAt: -1 }).skip((p - 1) * l).limit(l).lean().exec(),
      this.posts.countDocuments(filter),
    ]);
    return { posts, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  async postsByTag(tag: string, page = 1, limit = 10) { return this.listPublished(page, limit, tag); }

  async authorPage(authorId: string, page = 1, limit = 10) {
    const author = this.id(authorId, 'author ID');
    const p = Math.max(1, Number(page) || 1), l = Math.min(50, Math.max(1, Number(limit) || 10));
    const [profile, posts, total] = await Promise.all([
      this.posts.db.collection('users').findOne({ _id: author }, { projection: { name: 1, createdAt: 1 } }),
      this.posts.find({ author, status: PostStatus.Published }).sort({ publishedAt: -1 }).skip((p - 1) * l).limit(l).lean().exec(),
      this.posts.countDocuments({ author, status: PostStatus.Published }),
    ]);
    if (!profile) throw new NotFoundException('Author not found');
    return { author: { id: String(profile._id), name: profile.name }, posts, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  async addComment(userId: string, postId: string, content: string) {
    const post = await this.posts.findOne({ _id: this.id(postId, 'post ID'), status: PostStatus.Published }).select('_id').lean().exec();
    if (!post) throw new NotFoundException('Post not found');
    return this.comments.create({ post: post._id, author: this.id(userId, 'user ID'), content: content.trim() });
  }
  async listComments(postId: string) {
    const id = this.id(postId, 'post ID');
    const postExists = await this.posts.exists({ _id: id, status: PostStatus.Published });
    if (!postExists) throw new NotFoundException('Post not found');
    return this.comments.find({ post: id }).populate('author', 'name').sort({ createdAt: -1 }).lean().exec();
  }
  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await this.comments.findOneAndUpdate({ _id: this.id(commentId, 'comment ID'), author: this.id(userId, 'user ID') },
      { $set: { content: content.trim() } }, { new: true, runValidators: true }).exec();
    if (!comment) throw new NotFoundException('Comment not found or not owned by you');
    return comment;
  }
  async deleteComment(userId: string, commentId: string) {
    const result = await this.comments.findOneAndDelete({ _id: this.id(commentId, 'comment ID'), author: this.id(userId, 'user ID') }).exec();
    if (!result) throw new NotFoundException('Comment not found or not owned by you');
    return { deleted: true };
  }
  async toggleLike(userId: string, postId: string) {
    const post = await this.posts.findOne({ _id: this.id(postId, 'post ID'), status: PostStatus.Published }).select('_id').lean().exec();
    if (!post) throw new NotFoundException('Post not found');
    const filter = { post: post._id, user: this.id(userId, 'user ID') };
    const existing = await this.likes.findOne(filter).exec();
    if (existing) { await this.likes.deleteOne({ _id: existing._id }).exec(); return { liked: false }; }
    try { await this.likes.create(filter); } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
    return { liked: true };
  }
  async likeCount(postId: string) {
    const id = this.id(postId, 'post ID');
    return { postId, count: await this.likes.countDocuments({ post: id }) };
  }
  async uploadImages(userId: string, postId: string, files: Express.Multer.File[]) {
    const post = await this.posts.findOne({ _id: this.id(postId, 'post ID'), author: this.id(userId, 'user ID') }).select('_id').lean().exec();
    if (!post) throw new NotFoundException('Post not found or not owned by you');
    return this.media.saveImages({ files, ownerType: MediaOwnerType.Post, ownerId: post._id, uploadedBy: userId });
  }
  async listImages(postId: string) {
    const id = this.id(postId, 'post ID');
    const post = await this.posts.findOne({ _id: id, status: PostStatus.Published }).select('_id').lean().exec();
    if (!post) throw new NotFoundException('Post not found');
    return this.media.list(MediaOwnerType.Post, id);
  }
  async deleteImage(userId: string, postId: string, imageId: string) {
    const post = await this.posts.findOne({ _id: this.id(postId, 'post ID'), author: this.id(userId, 'user ID') }).select('_id').lean().exec();
    if (!post) throw new NotFoundException('Post not found or not owned by you');
    return this.media.remove(MediaOwnerType.Post, post._id, imageId);
  }
}
