import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnClodinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.accessToken = accessToken;

    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      400,
      "Something went wrong while generating refresh and access tokens",
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // GET USER DETAILS FROM FRONTEND AS PER OUR USER MODEL

  const { fullName, email, username, password } = req.body;

  console.log("email", username);

  // VALIDATION WEATHER FIELDS ARE EMPTY OR IN RIGHT FORMAT

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All Fields Are Required");
  }

  //  CHECK IF USER ALREADY EXIST

  const existingUser = await User.findOne({ $or: [{ username }, { email }] });

  if (existingUser) return new ApiError(409, "User Already Exist");

  // CHECK FOR IMAGES OR AVATAR

  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "AVATAR REQUIRED");
  }

  // UPLOAD THEM TO CLOUDINARY IF AVAILABLE, AVATAR UPLOADED SUCCECCFULLY OR NOT

  const avatar = await uploadOnClodinary(avatarLocalPath);
  const coverImage = await uploadOnClodinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "AVATAR REQUIRED");
  }

  // CREATE USER OBJECT - CREATE ENTRY IN DB

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    username: username.toLowerCase,
    email,
    password,
  });

  // REMOVE PASSWORD AND REFRESH TOKEN FIELD FROM RESPONSE
  // CHECK FOR USER CREATION
  const userId = await User.findById(user._id).select(
    "-password -refreshToken",
  );
  if (!userId) {
    throw new ApiError(500, "Something wemt wrong while uploading");
  }

  // RETURN USER
  return res
    .status(201)
    .json(new ApiResponse(200, userId, "USER REGISTERED SUCCESSFULLY"));
});

const loginUser = asyncHandler(async (req, res) => {
  //  TAKING INPUT FROM USER
  const { email, username, password } = req.body;

  // VALIDATE FIELDS
  if (!username || !email) {
    throw new ApiError(400, "CREDENTIALS REQUIRED");
  }
  // CHECKING IF USER EXISTS OR NOT
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) throw new ApiError(404, "USER DOESN'T EXIST");

  // PASSWORD CHECK IF USER EXISTS

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) throw new ApiError("INVALID CREDENTIALS");
  // GENERATING ACCESS TOKEN AND REFRESH TOKEN
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id,
  );
  // SEND COOKIES

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "USER LOGGED IN SUCCESSFULLY",
      ),
    );
});

const logOutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    },
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken",accessToken)
    .clearCookie("refreshToken", refreshToken)
    .json(new ApiResponse(200, {}, "User logged Out"));
});
export { registerUser, loginUser, logOutUser };
