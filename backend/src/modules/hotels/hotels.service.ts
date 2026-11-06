import { MediaService } from '../media/media.service';
import { MediaOwnerType } from '../media/schemas/media.schema';

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ProviderType, Role } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertModerates } from '../../common/utils/access.util';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { ReferenceDataService } from '../reference-data/reference-data.service';

import { CreateHotelDto, UpdateHotelDto } from './dto/hotels.dto';

import { Hotel, HotelDocument } from './schemas/hotel.schema';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name)
    private readonly hotels: Model<HotelDocument>,

    private readonly referenceData: ReferenceDataService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  /**
   * HTL-01: Only an administrator can create a hotel.
   */
  async createHotel(user: AuthUser, dto: CreateHotelDto) {
    if (user?.role !== Role.Admin) {
      throw new ForbiddenException('Admin role required');
    }

    // The selected city must exist in the reference database.
    const city = await this.referenceData.getCityById(dto.cityId);

    const hotel = await this.hotels.create({
      name: dto.name,
      address: dto.address,
      cityId: city._id,
      cityName: city.name,
      countryCode: city.countryCode,
      description: dto.description,
      starClass: dto.starClass,
      amenities: dto.amenities ?? [],
    });

    // Record the administrator's action.
    await this.audit.log(user, {
      action: AuditAction.ProviderCreated,
      targetType: 'hotel',
      targetId: hotel._id,
    });

    return hotel;
  }

  /**
   * HTL-01: A moderator can edit only their assigned hotel.
   */
  async updateHotel(user: AuthUser, hotelId: string, dto: UpdateHotelDto) {
    assertModerates(user, ProviderType.Hotel, hotelId);

    const changes: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      changes.name = dto.name;
    }

    if (dto.address !== undefined) {
      changes.address = dto.address;
    }

    if (dto.description !== undefined) {
      changes.description = dto.description;
    }

    if (dto.starClass !== undefined) {
      changes.starClass = dto.starClass;
    }

    if (dto.amenities !== undefined) {
      changes.amenities = dto.amenities;
    }

    // Keep the city and country consistent.
    if (dto.cityId !== undefined) {
      const city = await this.referenceData.getCityById(dto.cityId);

      changes.cityId = city._id;
      changes.cityName = city.name;
      changes.countryCode = city.countryCode;
    }

    const hotel = await this.hotels
      .findByIdAndUpdate(
        hotelId,
        { $set: changes },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    return hotel;
  }

  /**
   * HTL-02: Retrieve a hotel's profile and photos.
   * Room availability and reviews will be added later.
   */
  async findHotel(hotelId: string) {
    const hotel = await this.hotels.findById(hotelId).lean().exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    const photos = await this.media.list(MediaOwnerType.Hotel, hotelId);

    return {
      id: String(hotel._id),
      name: hotel.name,
      address: hotel.address,
      cityId: String(hotel.cityId),
      cityName: hotel.cityName,
      countryCode: hotel.countryCode,
      description: hotel.description ?? null,
      starClass: hotel.starClass,
      amenities: hotel.amenities,
      status: hotel.status,
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      cancellationTiers: hotel.cancellationTiers,
      averageRating: hotel.averageRating,
      ratingsCount: hotel.ratingsCount,
      photos,
      createdAt: hotel.createdAt,
      updatedAt: hotel.updatedAt,
    };
  }

  /**
   * HTL-01 / GEN-08:
   * Upload photos to the moderator's assigned hotel.
   */
  async uploadImages(user: AuthUser, hotelId: string, files: Express.Multer.File[]) {
    assertModerates(user, ProviderType.Hotel, hotelId);

    const hotel = await this.hotels.findById(hotelId).exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    return this.media.saveImages({
      files,
      ownerType: MediaOwnerType.Hotel,
      ownerId: hotelId,
      uploadedBy: user.id,
    });
  }

  /**
   * HTL-01: Remove an image from the assigned hotel.
   */
  async removeImage(user: AuthUser, hotelId: string, imageId: string) {
    assertModerates(user, ProviderType.Hotel, hotelId);

    const hotel = await this.hotels.findById(hotelId).exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    return this.media.remove(MediaOwnerType.Hotel, hotelId, imageId);
  }
}
