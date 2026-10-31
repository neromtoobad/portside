// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Harbour — the round clock and harbour board for Portside.
/// @notice Goods, pools and trades live in Portaldot's native pallets (assets, asset-conversion).
/// This contract only does what needs a neutral referee: it draws each round's event from a
/// commit-reveal seed mixed with a block hash, and anchors each day's leaderboard root.
/// Storage on pallet-revive costs a deposit per byte, so it stays deliberately small.
contract Harbour {
    uint8 public constant GOODS = 5;
    uint8 public constant KINDS = 6;

    address public immutable keeper;
    uint32 public season;
    uint32 public round;
    bytes32 public commit;
    uint64 public roundStartedAt;

    event SeasonOpened(uint32 indexed season, bytes32 commit);
    /// @param good 0 Coffee, 1 Spice, 2 Silk, 3 Salt, 4 Copper
    /// @param kind 0 Storm, 1 Shipwreck, 2 Guild buyout, 3 Bumper harvest, 4 Glut, 5 Calm seas
    /// @param magnitude price move in percent (5..29)
    event RoundOpened(uint32 indexed season, uint32 indexed round, uint8 good, uint8 kind, uint8 magnitude, bytes32 entropy);
    event DayAnchored(uint32 indexed season, uint32 indexed day, bytes32 root, uint32 players);

    error NotKeeper();
    error BadReveal();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor() {
        keeper = msg.sender;
    }

    /// Starts a new season. The keeper commits to the first round's seed up front.
    function openSeason(bytes32 firstCommit) external onlyKeeper {
        season += 1;
        round = 0;
        commit = firstCommit;
        emit SeasonOpened(season, firstCommit);
    }

    /// Reveals the seed committed last round and commits the next one.
    /// The block hash is unknown when the seed is committed, so the keeper can't pick the event,
    /// and the seed is unknown to players, so they can't predict it from the chain.
    function reveal(bytes32 seed, bytes32 nextCommit) external onlyKeeper {
        if (keccak256(abi.encodePacked(seed)) != commit) revert BadReveal();
        bytes32 entropy = keccak256(abi.encodePacked(seed, blockhash(block.number - 1), season, round));
        (uint8 good, uint8 kind, uint8 magnitude) = drawEvent(entropy);
        round += 1;
        commit = nextCommit;
        roundStartedAt = uint64(block.timestamp);
        emit RoundOpened(season, round, good, kind, magnitude, entropy);
    }

    /// Anchors the Merkle root of a day's final standings so anyone can verify a payout.
    function anchorDay(uint32 day, bytes32 root, uint32 players) external onlyKeeper {
        emit DayAnchored(season, day, root, players);
    }

    function drawEvent(bytes32 entropy) public pure returns (uint8 good, uint8 kind, uint8 magnitude) {
        uint256 e = uint256(entropy);
        good = uint8(e % GOODS);
        kind = uint8((e >> 8) % KINDS);
        magnitude = kind == 5 ? 0 : uint8(5 + ((e >> 16) % 25));
    }
}
