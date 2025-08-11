import { prop, getModelForClass, modelOptions, DocumentType } from "@typegoose/typegoose";

export enum UserRole {
  ADMIN = "admin",
  MEMBER = "member",
}

@modelOptions({
  schemaOptions: {
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { __v, ...cleanRet } = ret;
        return cleanRet;
      },
    },
  },
})
export class User {
  @prop({ required: true, unique: true })
  public clerkUserId!: string; // Clerk's unique user ID

  @prop({
    enum: UserRole,
    default: UserRole.MEMBER,
  })
  public role!: UserRole;

  @prop({ default: true })
  public isActive!: boolean;

  @prop()
  public lastLoginAt?: Date;

  @prop({ default: Date.now })
  public createdAt!: Date;

  @prop({ default: Date.now })
  public updatedAt!: Date;

  // Add any additional business-specific fields here

  public toProfileJSON(this: DocumentType<User>) {
    return {
      id: this._id,
      clerkUserId: this.clerkUserId,
      role: this.role,
      isActive: this.isActive,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt,
    };
  }
}

export const UserModel = getModelForClass(User);
