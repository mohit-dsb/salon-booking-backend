import slugify from "slugify";

// Helper method to create URL-friendly slugs
export const createSlug = (name: string): string => {
  return slugify(name, {
    lower: true, // Convert to lowercase
    strict: true, // Remove special characters
    remove: /[*+~.()'"!:@]/g, // Remove specific characters
  });
};
