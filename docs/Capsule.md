# Capsule Sync

Capsule Sync is a dead-simple peer-to-peer secure file synchronization solution optimized for mobile devices.

## Top-to-Bottom Summary

* A network is formed when two devices pair to each other. This network persists until there is only one device left.
* Tertiary devices only need to pair to one device in the network. The other devices will be auto-paired to the tertiary device.
* A network can consist of any number of devices.
* Each device on the network creates a collection of **Capsules**.
* Capsules have a file and folder matching ruleset:
 * This can match specific files and folders
 * Or, be more generic, such as match all audio/mp3 file types
* When a Capsule is created on a device in the network, it is broadcasted to the network
* Each device may choose which Capsules to subscribe too and sync from
* Synchronization is defaulted to one-way, but bidirectional synchronization and conflict resolution will be fully supported by the protocol and presented as an option per Capsule
* A **Capsule Containment Unit** is a device in the network that synchronizes and replicates all Capsules in the network.
 * The use-case is primarily targetted towards users who want an always-on server to be available for synchronization
* *Future Idea:* Intelligently distribute Capsule contents across network such that atleast 1 replica of every file exists on the network at all times.

## Architecture

* Strings shall be encoded in UTF8
* Dates shall be stored as UTC time

### Capsules

#### Rulesets
* Shall contain 1 or more source paths
* May contain 1 or more path exclusions, except for any source path
* May contain 1 or more filters:
 * Kind (Pictures, Music, Video, Documents) [is]
 * Extension [is, is not]
 * File Name [contains, starts with, ends with]
 * Size [less than, less than or equal to, greater than, greater than or equal to]
 * Creation Date [older, newer, between]
* Rulesets shall be internally represented as a binary tree of operations

#### Path Normalization
* Capsules must normalize paths such that they are compatible across all major platforms
* Normalization only occurs during the synchronization process and only on subscribed devices
 * No normalization is performed on the device that owns the Capsule
 * The original path name shall be available in the Capsule metadata
* Filenames must be limited to 255 characters, characters will be removed from near the end of the filename
* The following characters are illegal in paths and will be stripped:
 * < (less than)
 * \> (greater than)
 * : (colon)
 * " (double quote)
 * / (forward slash)
 * \\ (backslash)
 * | (vertical bar or pipe)
 * ? (question mark)
 * \* (asterisk)
 * ASCII control codes (<= 31 decimal)
* The following filenames are illegal:
 * CON
 * PRN
 * AUX
 * CLOCK$
 * NUL
 * COM[1-9]
 * LPT[1-9]
* Capsules shall preserve the case of a synchronized path unless it causes a conflict on the subscribed device
 * All case-insensitive filename synonyms shall be recorded in the Capsule, but only the first shall be synchronized
 * A deterministic algorithm shall enable automatic synchronization of synonomous filenames
   * Suffix the filename with .{X} where {X} is the variant index of the filename

#### Synchronization Strategy

* Source device may make a Capsule read-only
* Subscribed devices may use bidirectional synchronization if the Capsule is not read-only
 * By default, unidirectional (replica) synchronization is used

#### Storage Management (Subscribed Devices)

* Subscribed devices may have less storage available than a Capsule requires to fully synchronize
* Potential strategies:
 * Selective Synchronization (Manually control what is synchronized)
 * Synchronize most recently modified files
 * Synchronize most recently accessed files

### Indexing

* Indexing is the process by which Capsules are populated by files
* Upon creation of a Capsule, indexing will occur based on the ruleset of the Capsule
* A Capsules ruleset is parsed, and a set of root directories computed
* Each root directory will be recursively scanned to discover all containing files
 * Recursion into another root directory (by way of symlink) is forbidden
 * Each file discovered that passes the matching criteria of the ruleset will be indexed
* Every file, when indexed is:
 * Assigned a globally unique identifier
 * Initialized a version vector (with the first version added), and synchronization time vector.
 * Computed a relative path string such that the Capsule's prefix path is removed.
   * The relative path is normalized to the Capsule path specification
 * Queried for:
   * Size
   * Modification Date
   * *High Integrity:* SHA1 Checksum
 * Recorded into the Capsule database with the aforementioned metadata
* Indexing will occur once when the Capsule is created, and automatically after every restart of Capsule Sync
* Manual rescanning will be supported
* In the case a modification is detected during a rescan, please refer to the change notification section for the next action

### Change Notification

* Change notification is the process by which the host platform notifies Capsule Sync of any file modifications occuring within a Capsule
* The motivation is to reduce the need to perform a complete directory traversal
* Change notifications are only enabled for Source Capsules, or Capsules with bidirectional synchronization enabled
* Files synchronized from a Source Capsule with bidirectional synchronization disabled will have their read-only flag enabled
* A change notification for a file will:
 * Record a modification to the version vector of the file
   * The version identifier is the union of the device prefix, and the device change counter for the file. This ensures two devices can modify the version vector of the same file with no collisions.
  * Recorded the updates Size and Modification Date of the file
  * Result in a (debounced) push notification to the network of the change

### Network Management

* Device Discovery (LAN)
 * Each device announces itself using mDNS
 * Fallback to multicast discovery protocol if mDNS fails
 * mDNS will contain host, port, unique device identifier, and friendly device name

* Pairing
 * Utilize mDNS to initiate pair request
 * Use Capsule Sync Account to join pre-existing network


### Synchronization

### Security

### Consistency

### Over-the-Internet Synchronization

### Protocol

* QUIC for RPC

## Premium Features:
1. Generic Capsules
 * Rulesets that are not strict exact file and folder matches
2. Auto-organization of received Capsules
 * Use file metadata to automatically organize synchronized Capsule content (receiver only)
3. Automatic media format conversion
 * Convert media to file formats that are better supported by the target device
4. Over-the-internet synchronization
 * Establish a peer-to-peer connection over the internet and synchronize
5. File streaming
 * Access files as they’re syncing by way of streaming the file immediately when needed
